import { useEffect, useRef, useState } from 'react';
import type { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';
import { PixelRatio, StyleSheet, View } from 'react-native';
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
  const [resources, setResources] =
    useState<BurstConfettiResources | null>(null);
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
    if (!device || !resources) return;
    if (viewportWidth <= 0 || viewportHeight <= 0) return;
    if (count <= 0) return;
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

    const { renderPipeline } = createBurstConfettiPipelines(
      resources.root,
      presentationFormat
    );

    let rafId: number | null = null;
    let stopped = false;

    const renderFrame = () => {
      if (stopped) return;

      resources.uniforms.write({
        viewport: [viewportWidth, viewportHeight],
        opacity: opacity.get(),
        progress: progress.get(),
        totalDuration,
        flightDuration,
        gravity: gravityPxPerSec2,
        initialScale,
        flipIntensity,
        drag: [horizontalDrag, verticalDrag],
        _pad0: 0,
      });

      const encoder = device.createCommandEncoder();
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
      renderPipeline
        .with(renderPass)
        .with(resources.renderBindGroup)
        .draw(BURST_VERTS_PER_FLAKE, count);
      renderPass.end();

      device.queue.submit([encoder.finish()]);
      context.present();

      rafId = requestAnimationFrame(renderFrame);
    };

    rafId = requestAnimationFrame(renderFrame);

    return () => {
      stopped = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [
    device,
    resources,
    count,
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
  container: { ...StyleSheet.absoluteFill },
  canvas: { flex: 1 },
});
