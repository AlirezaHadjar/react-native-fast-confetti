import { useEffect, useRef, useState } from 'react';
import { PixelRatio, StyleSheet, View } from 'react-native';
import type { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';
import {
  Canvas,
  useDevice,
  type CanvasRef,
  type NativeCanvas,
} from 'react-native-wgpu';
import type { SharedValue } from 'react-native-reanimated';

import {
  createConfettiResources,
  destroyConfettiResources,
  type ConfettiResources,
} from './hooks/useConfettiResources';
import type { SizeVariation } from '../hooks/useConfettiFlakes';
import type { Spawn } from './utils';
import {
  UNIFORMS_BYTES,
  computeCode,
  renderCode,
} from './shaders/confetti';
import {
  DEFAULT_FOCAL_LENGTH_RATIO,
  DEFAULT_LIGHT_DIR,
  DEFAULT_FADE_START,
} from './constants';

export type GPUConfettiCanvasParams = {
  windStrength: number;
  magnusStrength: number;
  bounceRestitution: number;
  floorFriction: number;
  motionBlurAmount: number;
  shadowOpacity: number;
  iridescence: number;
  textureMode: number;
  gravityDir: SharedValue<[number, number, number]>;
};

type Props = {
  containerStyle?: StyleProp<ViewStyle>;
  onContainerLayout: (e: LayoutChangeEvent) => void;
  count: number;
  sizeVariations: SizeVariation[];
  allColors: string[];
  spawns: Spawn[] | null;
  cycleDuration: number;
  elapsed: SharedValue<number>;
  cycleCount: SharedValue<number>;
  opacity: SharedValue<number>;
  drift: number;
  initialScale: number;
  continuous: boolean;
  infinite: boolean;
  fadeOutOnEnd: boolean;
  gravityPxPerSec2: number;
  viewportWidth: number;
  viewportHeight: number;
  params: GPUConfettiCanvasParams;
  onAllOffScreen: () => void;
};

export const GPUConfettiCanvas = ({
  containerStyle,
  onContainerLayout,
  count,
  sizeVariations,
  allColors,
  spawns,
  cycleDuration,
  elapsed,
  cycleCount,
  opacity,
  drift,
  initialScale,
  continuous,
  infinite,
  fadeOutOnEnd,
  gravityPxPerSec2,
  viewportWidth,
  viewportHeight,
  params,
  onAllOffScreen,
}: Props) => {
  const { device } = useDevice();
  const canvasRef = useRef<CanvasRef>(null);
  const [resources, setResources] = useState<ConfettiResources | null>(null);

  useEffect(() => {
    if (!device || !spawns) return;
    let cancelled = false;
    (async () => {
      const res = await createConfettiResources({
        device,
        count,
        sizeVariations,
        allColors,
        spawns,
        cycleDuration,
      });
      if (cancelled) {
        destroyConfettiResources(res);
        return;
      }
      setResources((prev) => {
        if (prev) destroyConfettiResources(prev);
        return res;
      });
    })();
    return () => { cancelled = true; };
  }, [device, count, sizeVariations, allColors, spawns, cycleDuration]);

  useEffect(() => {
    return () => {
      setResources((prev) => {
        if (prev) destroyConfettiResources(prev);
        return null;
      });
    };
  }, []);

  useEffect(() => {
    if (!device || !resources) return;
    if (viewportWidth <= 0 || viewportHeight <= 0) return;
    const context = canvasRef.current?.getContext('webgpu');
    if (!context) return;

    const canvas = context.canvas as unknown as NativeCanvas;
    const dpr = PixelRatio.get();
    canvas.width = Math.max(1, Math.round(viewportWidth * dpr));
    canvas.height = Math.max(1, Math.round(viewportHeight * dpr));

    const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
      device,
      format: presentationFormat,
      alphaMode: 'premultiplied',
    });

    const computeModule = device.createShaderModule({ code: computeCode });
    const renderModule = device.createShaderModule({ code: renderCode });

    const computeBGL = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      ],
    });

    const renderBGL = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
        { binding: 3, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
        { binding: 4, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
        { binding: 5, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        { binding: 6, visibility: GPUShaderStage.FRAGMENT, texture: { viewDimension: '2d-array', sampleType: 'float' } },
      ],
    });

    const uniformBuffer = device.createBuffer({
      size: UNIFORMS_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const computeBindGroup = device.createBindGroup({
      layout: computeBGL,
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: { buffer: resources.spawnsBuffer } },
        { binding: 2, resource: { buffer: resources.runtimeBuffer } },
      ],
    });

    const renderBindGroup = device.createBindGroup({
      layout: renderBGL,
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: { buffer: resources.spawnsBuffer } },
        { binding: 2, resource: { buffer: resources.runtimeBuffer } },
        { binding: 3, resource: { buffer: resources.sizesBuffer } },
        { binding: 4, resource: { buffer: resources.paletteBuffer } },
        { binding: 5, resource: resources.sampler },
        { binding: 6, resource: resources.texturesArray.createView({ dimension: '2d-array' }) },
      ],
    });

    const computePipeline = device.createComputePipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [computeBGL] }),
      compute: { module: computeModule, entryPoint: 'cs_update' },
    });

    const renderPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [renderBGL] }),
      vertex: { module: renderModule, entryPoint: 'vs_main' },
      fragment: {
        module: renderModule,
        entryPoint: 'fs_main',
        targets: [
          {
            format: presentationFormat,
            blend: {
              color: {
                srcFactor: 'src-alpha',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add',
              },
              alpha: {
                srcFactor: 'one',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add',
              },
            },
          },
        ],
      },
      primitive: { topology: 'triangle-list' },
    });

    const scratch = new Float32Array(UNIFORMS_BYTES / 4);
    let rafId: number | null = null;
    let stopped = false;
    let lastSimSeconds = elapsed.get();
    let simSecondsAtLastRestart = elapsed.get();
    const focalLength = Math.max(100, viewportHeight * DEFAULT_FOCAL_LENGTH_RATIO);

    const renderFrame = () => {
      if (stopped) return;

      const nowSim = elapsed.get();
      let dt = nowSim - lastSimSeconds;
      lastSimSeconds = nowSim;
      if (dt < 0) {
        // elapsed was reset (new cycle). Refresh baseline.
        dt = 0;
        simSecondsAtLastRestart = nowSim;
      }
      if (dt > 1 / 30) dt = 1 / 30;

      const timeSec = Date.now() / 1000;
      const gDir = params.gravityDir.get();
      const gMag = gravityPxPerSec2;

      // viewport + lens
      scratch[0] = viewportWidth;
      scratch[1] = viewportHeight;
      scratch[2] = focalLength;
      scratch[3] = opacity.get();
      // dt/time/drift/initialScale
      scratch[4] = dt;
      scratch[5] = timeSec;
      scratch[6] = drift;
      scratch[7] = initialScale;
      // wind/magnus/continuous/infinite
      scratch[8] = params.windStrength;
      scratch[9] = params.magnusStrength;
      scratch[10] = continuous ? 1 : 0;
      scratch[11] = infinite ? 1 : 0;
      // progress/cycleCount/cycleDuration/fadeOutOnEnd
      // `progress` slot now carries `elapsed` (seconds); shader only uses it
      // indirectly through `dt` and `time`.
      scratch[12] = nowSim;
      scratch[13] = cycleCount.get();
      scratch[14] = cycleDuration;
      scratch[15] = fadeOutOnEnd ? 1 : 0;
      // fadeStart/bounce/friction/motionBlur
      scratch[16] = DEFAULT_FADE_START;
      scratch[17] = params.bounceRestitution;
      scratch[18] = params.floorFriction;
      scratch[19] = params.motionBlurAmount;
      // shadow/iridescence/gravityMag
      scratch[20] = params.shadowOpacity;
      scratch[21] = params.iridescence;
      scratch[22] = gMag;
      scratch[23] = params.textureMode;
      // lightDir @ offset 96/4=24
      scratch[24] = DEFAULT_LIGHT_DIR[0];
      scratch[25] = DEFAULT_LIGHT_DIR[1];
      scratch[26] = DEFAULT_LIGHT_DIR[2];
      // [27] padding
      // gravityDir @ offset 112/4=28
      scratch[28] = gDir[0];
      scratch[29] = gDir[1];
      scratch[30] = gDir[2];
      // [31] padding

      device.queue.writeBuffer(
        uniformBuffer,
        0,
        scratch.buffer as ArrayBuffer,
        scratch.byteOffset,
        scratch.byteLength
      );

      const encoder = device.createCommandEncoder();
      if (dt > 0) {
        const computePass = encoder.beginComputePass();
        computePass.setPipeline(computePipeline);
        computePass.setBindGroup(0, computeBindGroup);
        computePass.dispatchWorkgroups(Math.ceil(count / 64));
        computePass.end();
      }

      const texture = context.getCurrentTexture();
      const renderPass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: texture.createView(),
            clearValue: [0, 0, 0, 0],
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
      });
      renderPass.setPipeline(renderPipeline);
      renderPass.setBindGroup(0, renderBindGroup);
      // Tessellated flake: TESS*TESS*6 vertices (TESS=6 → 216 verts per instance).
      renderPass.draw(216, count);
      renderPass.end();

      device.queue.submit([encoder.finish()]);
      context.present();

      // Time-based restart: once per cycleDuration (only if caller wants it).
      // Callers can disable auto-restart via `cycleDuration === 0` (e.g. when
      // gyro is active and pieces should stay in play indefinitely).
      if (cycleDuration > 0) {
        const cycleSeconds = elapsed.get() - simSecondsAtLastRestart;
        if (cycleSeconds >= cycleDuration) {
          simSecondsAtLastRestart = elapsed.get();
          onAllOffScreen();
        }
      }

      rafId = requestAnimationFrame(renderFrame);
    };
    rafId = requestAnimationFrame(renderFrame);

    return () => {
      stopped = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
      uniformBuffer.destroy();
    };
  }, [
    device,
    resources,
    count,
    drift,
    initialScale,
    cycleDuration,
    continuous,
    infinite,
    fadeOutOnEnd,
    gravityPxPerSec2,
    viewportWidth,
    viewportHeight,
    elapsed,
    cycleCount,
    opacity,
    params,
    onAllOffScreen,
  ]);

  return (
    <View
      pointerEvents="none"
      onLayout={onContainerLayout}
      style={[styles.container, containerStyle]}
    >
      <Canvas ref={canvasRef} style={styles.canvas} transparent />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { ...StyleSheet.absoluteFillObject },
  canvas: { flex: 1 },
});
