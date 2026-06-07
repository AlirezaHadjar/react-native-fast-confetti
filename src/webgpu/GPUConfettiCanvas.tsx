import { useEffect, useRef, useState } from 'react';
import type { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';
import { PixelRatio, StyleSheet, View } from 'react-native';
import {
  Easing,
  type EasingFunction,
  type EasingFunctionFactory,
  type SharedValue,
} from 'react-native-reanimated';
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

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const resolveEasing = (
  easing: EasingFunction | EasingFunctionFactory
): EasingFunction => {
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
  const latestSpawnsRef = useRef<Spawn[] | null>(null);
  const latestCycleDurationRef = useRef(cycleDuration);

  const hasSpawns = spawns !== null;

  useEffect(() => {
    latestSpawnsRef.current = spawns;
    latestCycleDurationRef.current = cycleDuration;
  }, [spawns, cycleDuration]);

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

    const { computePipeline, renderPipeline } = createConfettiPipelines(
      resources.root,
      presentationFormat
    );

    let rafId: number | null = null;
    let stopped = false;
    const easing = resolveEasing(params.easing ?? Easing.linear);
    const getSimulationSeconds = (rawElapsed: number) => {
      if (continuous) return rawElapsed;
      if (cycleDuration <= 0) return rawElapsed;
      return easing(clamp01(rawElapsed / cycleDuration)) * cycleDuration;
    };
    let lastSimSeconds = getSimulationSeconds(elapsed.get());
    let simSecondsAtLastRestart = elapsed.get();
    const focalLength = Math.max(
      100,
      viewportHeight * DEFAULT_FOCAL_LENGTH_RATIO
    );

    const renderFrame = () => {
      if (stopped) return;

      const rawElapsed = elapsed.get();
      const nowSim = getSimulationSeconds(rawElapsed);
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
      const cycleProgress =
        !continuous && cycleDuration > 0
          ? clamp01(rawElapsed / cycleDuration)
          : 0;
      const fadeProgress =
        cycleProgress <= DEFAULT_FADE_START
          ? 0
          : (cycleProgress - DEFAULT_FADE_START) / (1 - DEFAULT_FADE_START);
      const fadeOpacity = fadeOutOnEnd ? 1 - clamp01(fadeProgress) : 1;

      resources.uniforms.write({
        viewport: [viewportWidth, viewportHeight],
        focalLength,
        opacity: opacity.get() * fadeOpacity,
        dt,
        time: timeSec,
        drift,
        initialScale,
        windStrength: params.windStrength,
        magnusStrength: params.magnusStrength,
        continuous: continuous ? 1 : 0,
        infinite: infinite ? 1 : 0,
        progress: nowSim,
        cycleCount: cycleCount.get(),
        cycleDuration,
        fadeOutOnEnd: fadeOutOnEnd ? 1 : 0,
        fadeStart: DEFAULT_FADE_START,
        bounceRestitution: params.bounceRestitution,
        floorFriction: params.floorFriction,
        motionBlurAmount: params.motionBlurAmount,
        shadowOpacity: params.shadowOpacity,
        iridescence: params.iridescence,
        gravityMag: gMag,
        textureMode: params.textureMode,
        lightDir: DEFAULT_LIGHT_DIR,
        minVisibleScale: Math.max(0, Math.min(1, 1 - params.flipIntensity)),
        gravityDir: gDir,
        _pad2: 0,
      });

      const encoder = device.createCommandEncoder();
      if (dt > 0) {
        const computePass = encoder.beginComputePass();
        computePipeline
          .with(computePass)
          .with(resources.computeBindGroup)
          .dispatchWorkgroups(Math.ceil(count / 64));
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
      renderPipeline
        .with(renderPass)
        .with(resources.renderBindGroup)
        .draw(VERTS_PER_FLAKE, count);
      renderPass.end();

      device.queue.submit([encoder.finish()]);
      context.present();

      // Time-based restart: once per cycleDuration (only if caller wants it).
      // Continuous mode recycles individual particles in the compute shader,
      // so a whole-batch restart would create a visible interruption.
      // Callers can disable auto-restart via `cycleDuration === 0` (e.g. when
      // gyro is active and pieces should stay in play indefinitely).
      if (!continuous && cycleDuration > 0) {
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
  container: { ...StyleSheet.absoluteFill },
  canvas: { flex: 1 },
});
