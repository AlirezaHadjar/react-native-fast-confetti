import { useCallback, useEffect, useRef, useState } from 'react';
import type { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';
import { PixelRatio, StyleSheet, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { Canvas, type CanvasRef } from 'react-native-webgpu';

import type { SizeVariation } from '../hooks/useConfettiFlakes';
import type { BurstParticle } from './burstResourcePacking';
import {
  createBurstConfettiResources,
  updateBurstConfettiParticles,
  type BurstConfettiResources,
} from './hooks/useBurstConfettiResources';
import {
  BURST_UNIFORMS_BYTES,
  BURST_VERTS_PER_FLAKE,
  createBurstConfettiPipelines,
} from './shaders/burstConfetti';
import {
  useDedicatedGPUFrame,
  type DedicatedGPUFrameTarget,
} from './hooks/useDedicatedGPUFrame';
import { useGPUDevice } from './hooks/useGPUDevice';
import { configureCanvasSurface } from './configureCanvasSurface';

type NumericValue = {
  get: () => number;
};

type BooleanValue = {
  get: () => boolean;
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
  running: BooleanValue;
  opacity: NumericValue;
  gravityPxPerSec2: number;
  horizontalDrag: number;
  verticalDrag: number;
  initialScale: number;
  flipIntensity: number;
  viewportWidth: number;
  viewportHeight: number;
  onReadyChange: (ready: boolean) => void;
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
  running,
  opacity,
  gravityPxPerSec2,
  horizontalDrag,
  verticalDrag,
  initialScale,
  flipIntensity,
  viewportWidth,
  viewportHeight,
  onReadyChange,
}: Props) => {
  const device = useGPUDevice();
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
  const lastRenderedProgress = useSharedValue(Number.NaN);
  const surfaceReady = useSharedValue(false);

  const count = particles.length;
  const hasParticles = count > 0;
  const reportReady = useCallback(() => onReadyChange(true), [onReadyChange]);

  useEffect(() => {
    latestParticlesRef.current = particles;
  }, [particles]);

  useEffect(() => {
    const currentParticles = latestParticlesRef.current;
    if (!device || currentParticles.length === 0) {
      return;
    }
    onReadyChange(false);
    let cancelled = false;
    (async () => {
      const res = await createBurstConfettiResources({
        device,
        particles: currentParticles,
        sizeVariations,
        allColors,
      });
      if (cancelled) {
        return;
      }
      setResources(res);
    })();
    return () => {
      cancelled = true;
    };
  }, [device, count, sizeVariations, allColors, hasParticles, onReadyChange]);

  useEffect(() => {
    if (!resources || particles.length === 0) return;
    updateBurstConfettiParticles(resources, particles);
  }, [resources, particles]);

  useEffect(() => {
    if (!device || !resources) {
      return;
    }
    if (viewportWidth <= 0 || viewportHeight <= 0) {
      return;
    }
    if (count <= 0) {
      return;
    }
    const context = canvasRef.current?.getContext('webgpu');
    if (!context) {
      return;
    }

    const dpr = PixelRatio.get();
    const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

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
    configureCanvasSurface(
      context,
      device,
      Math.max(1, Math.round(viewportWidth * dpr)),
      Math.max(1, Math.round(viewportHeight * dpr)),
      presentationFormat,
      surfaceReady,
      reportReady
    );
    lastRenderedProgress.set(Number.NaN);
  }, [
    device,
    resources,
    count,
    viewportWidth,
    viewportHeight,
    lastRenderedProgress,
    surfaceReady,
    reportReady,
  ]);

  const activeRawFrameState =
    rawFrameState?.device === device &&
    rawFrameState.count === count &&
    rawFrameState.viewportWidth === viewportWidth &&
    rawFrameState.viewportHeight === viewportHeight
      ? rawFrameState
      : null;

  const shouldScheduleFrame = useCallback(() => {
    'worklet';
    return (
      surfaceReady.get() &&
      (running.get() || progress.get() !== lastRenderedProgress.get())
    );
  }, [lastRenderedProgress, progress, running, surfaceReady]);

  const renderFrame = useCallback(
    (
      _timestamp: number,
      _timeSinceFirstFrame: number,
      target: DedicatedGPUFrameTarget
    ): GPUCommandBuffer | null => {
      'worklet';

      if (!activeRawFrameState) return null;

      const currentProgress = progress.get();
      if (!running.get() && currentProgress === lastRenderedProgress.get()) {
        return null;
      }
      lastRenderedProgress.set(currentProgress);

      const uniforms = uniformDataRef.current;
      uniforms[0] = activeRawFrameState.viewportWidth;
      uniforms[1] = activeRawFrameState.viewportHeight;
      uniforms[2] = opacity.get();
      uniforms[3] = currentProgress;
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
      activeRawFrameState.device.queue.writeBuffer(
        activeRawFrameState.uniformBuffer,
        0,
        uniforms
      );

      const encoder = activeRawFrameState.device.createCommandEncoder();
      target.colorAttachment.view = activeRawFrameState.context
        .getCurrentTexture()
        .createView();
      const renderPass = encoder.beginRenderPass(target.descriptor);
      renderPass.setPipeline(activeRawFrameState.renderPipeline);
      renderPass.setBindGroup(0, activeRawFrameState.renderBindGroup);
      renderPass.draw(BURST_VERTS_PER_FLAKE, activeRawFrameState.count);
      renderPass.end();

      return encoder.finish();
    },
    [
      flightDuration,
      flipIntensity,
      gravityPxPerSec2,
      horizontalDrag,
      initialScale,
      lastRenderedProgress,
      opacity,
      progress,
      activeRawFrameState,
      running,
      totalDuration,
      uniformDataRef,
      verticalDrag,
    ]
  );

  useDedicatedGPUFrame(
    renderFrame,
    activeRawFrameState?.device ?? null,
    activeRawFrameState?.context ?? null,
    activeRawFrameState !== null,
    shouldScheduleFrame
  );

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
