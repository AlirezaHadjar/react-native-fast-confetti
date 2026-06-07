import { useEffect, useRef, useState } from 'react';
import type { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';
import { PixelRatio, StyleSheet, View } from 'react-native';
import {
  Easing,
  useFrameCallback,
  useSharedValue,
  type EasingFunction,
  type EasingFunctionFactory,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import {
  Canvas,
  useDevice,
  type CanvasRef,
  type NativeCanvas,
} from 'react-native-wgpu';

import type { SizeVariation } from '../hooks/useConfettiFlakes';
import {
  DEFAULT_FADE_START,
  DEFAULT_FOCAL_LENGTH_RATIO,
  DEFAULT_LIGHT_DIR,
} from './constants';
import {
  createConfettiResources,
  destroyConfettiResources,
  updateConfettiRuntimeResources,
  type ConfettiResources,
} from './hooks/useConfettiResources';
import {
  UNIFORMS_BYTES,
  VERTS_PER_FLAKE,
  createConfettiPipelines,
} from './shaders/confetti';
import type { Spawn } from './utils';

export type GPUConfettiCanvasParams = {
  windStrength: number;
  magnusStrength: number;
  flipIntensity: number;
  bounceRestitution: number;
  floorFriction: number;
  motionBlurAmount: number;
  shadowOpacity: number;
  iridescence: number;
  textureMode: number;
  easing: EasingFunction | EasingFunctionFactory;
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
  running: SharedValue<boolean>;
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

type RawFrameState = {
  device: GPUDevice;
  context: GPUCanvasContext & { present?: () => void };
  uniformBuffer: GPUBuffer;
  computePipeline: GPUComputePipeline;
  renderPipeline: GPURenderPipeline;
  computeBindGroup: GPUBindGroup;
  renderBindGroup: GPUBindGroup;
  workgroupCount: number;
  count: number;
  focalLength: number;
  viewportWidth: number;
  viewportHeight: number;
};

const clamp01 = (value: number) => {
  'worklet';
  return Math.max(0, Math.min(1, value));
};

const resolveEasing = (
  easing: EasingFunction | EasingFunctionFactory
): EasingFunction => {
  'worklet';
  if (typeof easing === 'function') return easing;
  return easing.factory();
};

export const GPUConfettiCanvas = ({
  containerStyle,
  onContainerLayout,
  count,
  sizeVariations,
  allColors,
  spawns,
  cycleDuration,
  running,
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
  const [rawFrameState, setRawFrameState] = useState<RawFrameState | null>(
    null
  );
  const uniformDataRef = useRef(
    new Float32Array(UNIFORMS_BYTES / Float32Array.BYTES_PER_ELEMENT)
  );
  const latestSpawnsRef = useRef<Spawn[] | null>(null);
  const latestCycleDurationRef = useRef(cycleDuration);
  const elapsed = useSharedValue(0);
  const lastSimSeconds = useSharedValue(0);
  const wasRunning = useSharedValue(false);

  const hasSpawns = spawns !== null;

  useEffect(() => {
    latestSpawnsRef.current = spawns;
    latestCycleDurationRef.current = cycleDuration;
    elapsed.set(0);
    lastSimSeconds.set(0);
    wasRunning.set(false);
  }, [spawns, cycleDuration, elapsed, lastSimSeconds, wasRunning]);

  useEffect(() => {
    const currentSpawns = latestSpawnsRef.current;
    if (!device || !currentSpawns) return;
    let cancelled = false;
    (async () => {
      const res = await createConfettiResources({
        device,
        count,
        sizeVariations,
        allColors,
        spawns: currentSpawns,
        cycleDuration: latestCycleDurationRef.current,
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
    return () => {
      cancelled = true;
    };
  }, [device, count, sizeVariations, allColors, hasSpawns]);

  useEffect(() => {
    if (!resources || !spawns) return;
    updateConfettiRuntimeResources(resources, spawns, cycleDuration);
  }, [resources, spawns, cycleDuration]);

  useEffect(() => {
    return () => {
      setResources((prev) => {
        if (prev) destroyConfettiResources(prev);
        return null;
      });
    };
  }, []);

  useEffect(() => {
    if (!device || !resources) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- WebGPU context availability controls the UI-thread frame callback closure.
      setRawFrameState(null);
      return;
    }
    if (viewportWidth <= 0 || viewportHeight <= 0) {
      setRawFrameState(null);
      return;
    }
    const context = canvasRef.current?.getContext('webgpu');
    if (!context) {
      setRawFrameState(null);
      return;
    }

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

    const { computePipeline, renderPipeline } = createConfettiPipelines(
      resources.root,
      presentationFormat
    );

    elapsed.set(0);
    lastSimSeconds.set(0);
    wasRunning.set(false);
    setRawFrameState({
      device,
      context,
      uniformBuffer: resources.uniforms.buffer.buffer,
      computePipeline: resources.root.unwrap(computePipeline),
      renderPipeline: resources.root.unwrap(renderPipeline),
      computeBindGroup: resources.root.unwrap(resources.computeBindGroup),
      renderBindGroup: resources.root.unwrap(resources.renderBindGroup),
      workgroupCount: Math.ceil(count / 64),
      count,
      focalLength: Math.max(100, viewportHeight * DEFAULT_FOCAL_LENGTH_RATIO),
      viewportWidth,
      viewportHeight,
    });
  }, [
    device,
    resources,
    count,
    viewportWidth,
    viewportHeight,
    elapsed,
    lastSimSeconds,
    wasRunning,
  ]);

  useFrameCallback((frameInfo) => {
    'worklet';

    if (!rawFrameState) return;
    if (!running.get()) {
      wasRunning.set(false);
      return;
    }

    const rawDt = wasRunning.get()
      ? Math.min(
          Math.max((frameInfo.timeSincePreviousFrame ?? 0) / 1000, 0),
          1 / 30
        )
      : 0;
    wasRunning.set(true);

    const rawElapsed = elapsed.get() + rawDt;
    elapsed.set(rawElapsed);

    const easing = resolveEasing(params.easing ?? Easing.linear);
    const nowSim =
      continuous || infinite || cycleDuration <= 0
        ? rawElapsed
        : easing(clamp01(rawElapsed / cycleDuration)) * cycleDuration;

    let dt = nowSim - lastSimSeconds.get();
    lastSimSeconds.set(nowSim);
    if (dt < 0) dt = 0;
    if (dt > 1 / 30) dt = 1 / 30;

    const gDir = params.gravityDir.get();
    const cycleProgress =
      !continuous && !infinite && cycleDuration > 0
        ? clamp01(rawElapsed / cycleDuration)
        : 0;
    const fadeProgress =
      cycleProgress <= DEFAULT_FADE_START
        ? 0
        : (cycleProgress - DEFAULT_FADE_START) / (1 - DEFAULT_FADE_START);
    const fadeOpacity = fadeOutOnEnd ? 1 - clamp01(fadeProgress) : 1;
    const minVisibleScale = Math.max(0, Math.min(1, 1 - params.flipIntensity));

    const uniforms = uniformDataRef.current;
    uniforms[0] = rawFrameState.viewportWidth;
    uniforms[1] = rawFrameState.viewportHeight;
    uniforms[2] = rawFrameState.focalLength;
    uniforms[3] = opacity.get() * fadeOpacity;
    uniforms[4] = dt;
    uniforms[5] = rawElapsed;
    uniforms[6] = drift;
    uniforms[7] = initialScale;
    uniforms[8] = params.windStrength;
    uniforms[9] = params.magnusStrength;
    uniforms[10] = continuous ? 1 : 0;
    uniforms[11] = infinite ? 1 : 0;
    uniforms[12] = nowSim;
    uniforms[13] = cycleCount.get();
    uniforms[14] = cycleDuration;
    uniforms[15] = fadeOutOnEnd ? 1 : 0;
    uniforms[16] = DEFAULT_FADE_START;
    uniforms[17] = params.bounceRestitution;
    uniforms[18] = params.floorFriction;
    uniforms[19] = params.motionBlurAmount;
    uniforms[20] = params.shadowOpacity;
    uniforms[21] = params.iridescence;
    uniforms[22] = gravityPxPerSec2;
    uniforms[23] = params.textureMode;
    uniforms[24] = DEFAULT_LIGHT_DIR[0];
    uniforms[25] = DEFAULT_LIGHT_DIR[1];
    uniforms[26] = DEFAULT_LIGHT_DIR[2];
    uniforms[27] = minVisibleScale;
    uniforms[28] = gDir[0];
    uniforms[29] = gDir[1];
    uniforms[30] = gDir[2];
    uniforms[31] = 0;
    rawFrameState.device.queue.writeBuffer(
      rawFrameState.uniformBuffer,
      0,
      uniforms
    );

    const encoder = rawFrameState.device.createCommandEncoder();
    if (dt > 0) {
      const computePass = encoder.beginComputePass();
      computePass.setPipeline(rawFrameState.computePipeline);
      computePass.setBindGroup(0, rawFrameState.computeBindGroup);
      computePass.dispatchWorkgroups(rawFrameState.workgroupCount);
      computePass.end();
    }

    const renderPass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: rawFrameState.context.getCurrentTexture().createView(),
          clearValue: [0, 0, 0, 0],
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    renderPass.setPipeline(rawFrameState.renderPipeline);
    renderPass.setBindGroup(0, rawFrameState.renderBindGroup);
    renderPass.draw(VERTS_PER_FLAKE, rawFrameState.count);
    renderPass.end();

    rawFrameState.device.queue.submit([encoder.finish()]);
    rawFrameState.context.present?.();

    if (!continuous && !infinite && cycleDuration > 0) {
      const done = rawElapsed >= cycleDuration;
      if (done) {
        elapsed.set(0);
        lastSimSeconds.set(0);
        wasRunning.set(false);
        scheduleOnRN(onAllOffScreen);
      }
    }
  });

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
  container: { ...StyleSheet.absoluteFill },
  canvas: { flex: 1 },
});
