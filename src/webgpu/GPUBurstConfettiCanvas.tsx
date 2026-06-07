import { useEffect, useRef, useState } from 'react';
import type { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';
import { PixelRatio, StyleSheet, View } from 'react-native';
import { useFrameCallback } from 'react-native-reanimated';
import {
  Canvas,
  useDevice,
  type CanvasRef,
  type NativeCanvas,
} from 'react-native-wgpu';

import type { SizeVariation } from '../hooks/useConfettiFlakes';
import type { BurstParticle } from './burstResourcePacking';
import {
  createBurstConfettiResources,
  destroyBurstConfettiResources,
  updateBurstConfettiParticles,
  type BurstConfettiResources,
} from './hooks/useBurstConfettiResources';
import {
  BURST_UNIFORMS_BYTES,
  BURST_VERTS_PER_FLAKE,
  createBurstConfettiPipelines,
} from './shaders/burstConfetti';

type NumericValue = {
  get: () => number;
};

type Props = {
  containerStyle?: StyleProp<ViewStyle>;
  onContainerLayout: (e: LayoutChangeEvent) => void;
  particles: BurstParticle[];
  sizeVariations: SizeVariation[];
  allColors: string[];
  totalDuration: number;
  flightDuration: number;
  progress: NumericValue;
  opacity: NumericValue;
  gravityPxPerSec2: number;
  horizontalDrag: number;
  verticalDrag: number;
  initialScale: number;
  flipIntensity: number;
  viewportWidth: number;
  viewportHeight: number;
};

type RawFrameState = {
  device: GPUDevice;
  context: GPUCanvasContext & { present?: () => void };
  uniformBuffer: GPUBuffer;
  renderPipeline: GPURenderPipeline;
  renderBindGroup: GPUBindGroup;
  count: number;
  viewportWidth: number;
  viewportHeight: number;
};

export const GPUBurstConfettiCanvas = ({
  containerStyle,
  onContainerLayout,
  particles,
  sizeVariations,
  allColors,
  totalDuration,
  flightDuration,
  progress,
  opacity,
  gravityPxPerSec2,
  horizontalDrag,
  verticalDrag,
  initialScale,
  flipIntensity,
  viewportWidth,
  viewportHeight,
}: Props) => {
  const { device } = useDevice();
  const canvasRef = useRef<CanvasRef>(null);
  const [resources, setResources] = useState<BurstConfettiResources | null>(
    null
  );
  const [rawFrameState, setRawFrameState] = useState<RawFrameState | null>(
    null
  );
  const uniformDataRef = useRef(
    new Float32Array(BURST_UNIFORMS_BYTES / Float32Array.BYTES_PER_ELEMENT)
  );
  const latestParticlesRef = useRef<BurstParticle[]>([]);

  const count = particles.length;
  const hasParticles = count > 0;

  useEffect(() => {
    latestParticlesRef.current = particles;
  }, [particles]);

  useEffect(() => {
    const currentParticles = latestParticlesRef.current;
    if (!device || currentParticles.length === 0) {
      setResources((prev) => {
        if (prev) destroyBurstConfettiResources(prev);
        return null;
      });
      return;
    }
    let cancelled = false;
    (async () => {
      const res = await createBurstConfettiResources({
        device,
        particles: currentParticles,
        sizeVariations,
        allColors,
      });
      if (cancelled) {
        destroyBurstConfettiResources(res);
        return;
      }
      setResources((prev) => {
        if (prev) destroyBurstConfettiResources(prev);
        return res;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [device, count, sizeVariations, allColors, hasParticles]);

  useEffect(() => {
    if (!resources || particles.length === 0) return;
    updateBurstConfettiParticles(resources, particles);
  }, [resources, particles]);

  useEffect(() => {
    return () => {
      setResources((prev) => {
        if (prev) destroyBurstConfettiResources(prev);
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
    if (count <= 0) {
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

    const { renderPipeline } = createBurstConfettiPipelines(
      resources.root,
      presentationFormat
    );

    setRawFrameState({
      device,
      context,
      uniformBuffer: resources.uniforms.buffer.buffer,
      renderPipeline: resources.root.unwrap(renderPipeline),
      renderBindGroup: resources.root.unwrap(resources.renderBindGroup),
      count,
      viewportWidth,
      viewportHeight,
    });
  }, [device, resources, count, viewportWidth, viewportHeight]);

  useFrameCallback(() => {
    'worklet';

    if (!rawFrameState) return;

    const uniforms = uniformDataRef.current;
    uniforms[0] = rawFrameState.viewportWidth;
    uniforms[1] = rawFrameState.viewportHeight;
    uniforms[2] = opacity.get();
    uniforms[3] = progress.get();
    uniforms[4] = totalDuration;
    uniforms[5] = flightDuration;
    uniforms[6] = gravityPxPerSec2;
    uniforms[7] = initialScale;
    uniforms[8] = flipIntensity;
    uniforms[9] = 0;
    uniforms[10] = horizontalDrag;
    uniforms[11] = verticalDrag;
    uniforms[12] = 0;
    uniforms[13] = 0;
    rawFrameState.device.queue.writeBuffer(
      rawFrameState.uniformBuffer,
      0,
      uniforms
    );

    const encoder = rawFrameState.device.createCommandEncoder();
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
    renderPass.draw(BURST_VERTS_PER_FLAKE, rawFrameState.count);
    renderPass.end();

    rawFrameState.device.queue.submit([encoder.finish()]);
    rawFrameState.context.present?.();
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
