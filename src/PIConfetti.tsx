import { useRSXformBuffer } from '@shopify/react-native-skia';
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  forwardRef,
} from 'react';
import {
  Extrapolation,
  interpolate,
  runOnUI,
  useSharedValue,
} from 'react-native-reanimated';
import {
  resolveNamedPosition,
  estimatePIDuration,
} from './utils';
import {
  DEFAULT_PI_CONFETTI_GRAVITY,
  DEFAULT_PI_CONFETTI_DRAG,
  DEFAULT_PI_CONFETTI_LAUNCH_DELAY_MAX,
} from './constants';
import type {
  PIConfettiMethods,
  PIConfettiProps,
  PIConfettiRestartOptions,
  Position,
} from './types';
import { usePackedConfettiLogic } from './hooks/useConfettiLogic';
import { usePIOrigins } from './hooks/usePIOrigins';
import { useTextureProps } from './hooks/useTextureProps';
import { useAnimationLifecycle } from './hooks/useAnimationLifecycle';
import { useContainerDimensions } from './hooks/useContainerDimensions';
import { useReduceMotionFactor } from './hooks/useReduceMotionFactor';
import {
  isReduceMotionPieceVisible,
  scaleValueForMotion,
} from './reduceMotion';
import { ConfettiCanvas } from './ConfettiCanvas';
import { Origin, Flake } from './PIConfettiComponents';
import {
  BURST_DEPTH_SCALE,
  BURST_FLAGS,
  BURST_FLAG_CLOCKWISE,
  BURST_FLOAT_STRIDE,
  BURST_INITIAL_ROTATION,
  BURST_LAUNCH_DELAY,
  BURST_META_STRIDE,
  BURST_ORIGIN_DELAY,
  BURST_ORIGIN_INDEX,
  BURST_ROTATION_X,
  BURST_ROTATION_Z,
  BURST_SIZE_INDEX,
  BURST_VX,
  BURST_VY,
  generatePackedPIBoxes,
  type PackedBurstBoxes,
} from './packedBurstBoxes';

const PIConfettiInner = forwardRef<PIConfettiMethods, PIConfettiProps>(
  (
    {
      children,
      colors: rootColors,
      gravity = DEFAULT_PI_CONFETTI_GRAVITY,
      drag: dragProp = DEFAULT_PI_CONFETTI_DRAG,
      autoplay = true,
      infinite = false,
      fadeOutOnEnd = false,
      autoStartDelay = 0,
      rotation: rootRotation,
      depth: rootDepth,
      speedVariation: rootSpeedVariation,
      flakeStyle = 'glossy',
      initialScale = 0.3,
      flipIntensity = 0.85,
      easing,
      sprayDuration,
      reduceMotion,
      onAnimationEnd,
      onAnimationStart,
      containerStyle,
      ...textureRootProps
    },
    ref
  ) => {
    const { factor: reduceMotionFactor, ready: reduceMotionReady } =
      useReduceMotionFactor(reduceMotion);
    const effectiveFlipIntensity = scaleValueForMotion(
      flipIntensity,
      reduceMotionFactor
    );

    const { containerWidth, containerHeight, onContainerLayout, ready } =
      useContainerDimensions(containerStyle);

    const parentTexture = useTextureProps(textureRootProps);

    // --- Resolve drag into horizontal / vertical ---
    const hDrag = typeof dragProp === 'number' ? dragProp : dragProp.horizontal;
    const vDrag = typeof dragProp === 'number' ? dragProp : dragProp.vertical;

    // --- Parse children + build atlas via hook ---
    const {
      blastPositions,
      originDelays,
      piConfigs,
      durationPiConfigs,
      allColors,
      sizeVariations,
      colorOverrides,
      sizeIsTextured,
      parentColorCount,
      totalCount,
      visibleCount,
    } = usePIOrigins({
      children,
      rootColors,
      rootRotation,
      rootDepth,
      rootSpeedVariation,
      rootFlakeStyle: flakeStyle,
      containerWidth,
      containerHeight,
      parentTexture,
      reduceMotionFactor,
    });

    // --- Auto-compute duration from physics ---
    const { flightDuration, totalDuration: duration } = estimatePIDuration({
      piConfigs: durationPiConfigs,
      blastPositions,
      originDelays,
      gravity,
      vDrag,
      sprayDurationMs: sprayDuration,
      containerHeight,
    });

    // --- Compute launch delay max from sprayDuration ---
    const launchDelayMax =
      sprayDuration !== undefined
        ? Math.min(sprayDuration / duration, 1)
        : DEFAULT_PI_CONFETTI_LAUNCH_DELAY_MAX;

    const dynamicBlastPositions = useSharedValue<Position[] | null>(null);
    const dynamicOriginDelays = useSharedValue<number[] | null>(null);

    // Populate only from refreshBoxes on the UI runtime. Eager generation in
    // a hook argument reran for every React render and copied the full particle
    // graph across runtimes before immediately replacing it.
    const boxes = useSharedValue<PackedBurstBoxes | null>(null);

    useLayoutEffect(() => {
      return () => {
        boxes.set(null);
        dynamicBlastPositions.set(null);
        dynamicOriginDelays.set(null);
      };
    }, [boxes, dynamicBlastPositions, dynamicOriginDelays]);

    const { texture, sprites } = usePackedConfettiLogic({
      sizeVariations,
      colors: allColors,
      boxes,
      sizeColorOverrides: colorOverrides,
      count: totalCount,
    });

    const refreshBoxes = useCallback(() => {
      'worklet';
      const newBoxes = generatePackedPIBoxes({
        piConfigs,
        originDelays: dynamicOriginDelays.get() || originDelays,
        containerHeight,
        launchDelayMax,
        sizeColorOverrides: colorOverrides,
        parentColorCount,
        sizeIsTextured,
      });
      boxes.set(newBoxes);
    }, [
      piConfigs,
      originDelays,
      dynamicOriginDelays,
      boxes,
      containerHeight,
      launchDelayMax,
      colorOverrides,
      parentColorCount,
      sizeIsTextured,
    ]);

    const { progress, running, opacity, pause, reset, resume, runAnimation } =
      useAnimationLifecycle({
        duration,
        infinite,
        fadeOutOnEnd,
        easing,
        onAnimationStart,
        onAnimationEnd,
        fadeRange: [0.5, 0.9],
        onCycleEnd: refreshBoxes,
        disabled: visibleCount === 0,
      });

    const workletRestart = useCallback(
      (
        resolvedPositions: Position[] | null,
        resolvedDelays: number[] | null,
        delay: number = 0
      ) => {
        'worklet';
        dynamicBlastPositions.set(resolvedPositions);
        dynamicOriginDelays.set(resolvedDelays);
        refreshBoxes();
        runAnimation(delay);
      },
      [dynamicBlastPositions, dynamicOriginDelays, refreshBoxes, runAnimation]
    );

    const jsRestart = useCallback(
      (options: PIConfettiRestartOptions = {}) => {
        let resolvedPositions: Position[] | null = null;
        let resolvedDelays: number[] | null = null;
        if (options.origins) {
          resolvedPositions = options.origins.map((o) =>
            resolveNamedPosition(o.blastPosition, containerWidth, containerHeight)
          );
          resolvedDelays = options.origins.map((o) => o.delay ?? 0);
        }
        runOnUI(workletRestart)(resolvedPositions, resolvedDelays);
      },
      [workletRestart, containerWidth, containerHeight]
    );

    useImperativeHandle(ref, () => ({
      pause: runOnUI(pause),
      reset: runOnUI(reset),
      resume: runOnUI(resume),
      restart: jsRestart,
    }));

    useEffect(() => {
      if (!ready || !reduceMotionReady) return;
      runOnUI(() => {
        if (visibleCount === 0) {
          if (autoplay) {
            workletRestart(null, null, 0);
          } else {
            reset();
            refreshBoxes();
          }
          return;
        }
        if (running.get()) {
          refreshBoxes();
          return;
        }
        if (autoplay)
          workletRestart(null, null, autoStartDelay);
      })();
    }, [
      autoplay,
      autoStartDelay,
      workletRestart,
      running,
      ready,
      reset,
      refreshBoxes,
      visibleCount,
      reduceMotionReady,
    ]);

    const scaledGravity = gravity * containerHeight;
    const flightTimeSec = flightDuration / 1000;

    const transforms = useRSXformBuffer(totalCount, (val, i) => {
      'worklet';
      if (!isReduceMotionPieceVisible(i, totalCount, visibleCount)) {
        val.set(0, 0, -10000, -10000);
        return;
      }

      const packed = boxes.get();
      if (!packed) {
        val.set(0, 0, -10000, -10000);
        return;
      }

      const valueOffset = i * BURST_FLOAT_STRIDE;
      const metaOffset = i * BURST_META_STRIDE;
      const originIndex =
        packed.metadata[metaOffset + BURST_ORIGIN_INDEX] ?? 0;

      const currentPositions =
        dynamicBlastPositions.get() || blastPositions;
      const blast =
        currentPositions[originIndex % currentPositions.length];
      if (!blast) {
        val.set(0, 0, -10000, -10000);
        return;
      }
      const blastX = blast.x;
      const blastY = blast.y;

      const vx = packed.values[valueOffset + BURST_VX] ?? 0;
      const vy = packed.values[valueOffset + BURST_VY] ?? 0;
      const launchDelay =
        packed.values[valueOffset + BURST_LAUNCH_DELAY] ?? 0;
      const depthScale =
        packed.values[valueOffset + BURST_DEPTH_SCALE] ?? 1;
      const rotationX =
        packed.values[valueOffset + BURST_ROTATION_X] ?? 0;
      const rotationZ =
        packed.values[valueOffset + BURST_ROTATION_Z] ?? 0;
      const initialRotation =
        packed.values[valueOffset + BURST_INITIAL_ROTATION] ?? 0;
      const originDelay =
        packed.values[valueOffset + BURST_ORIGIN_DELAY] ?? 0;
      const clockwise =
        ((packed.metadata[metaOffset + BURST_FLAGS] ?? 0) &
          BURST_FLAG_CLOCKWISE) !==
        0;
      const sizeIndex =
        packed.metadata[metaOffset + BURST_SIZE_INDEX] ?? -1;

      const p = progress.get();

      // Convert global progress to local flight progress for this piece:
      // 1. Compute elapsed ms from global progress
      // 2. Subtract this origin's delay to get local elapsed ms
      // 3. Map to [0, 1] over the flight duration (not total duration)
      // This ensures all origins have identical physics regardless of delay.
      const elapsedMs = p * duration;
      const localMs = elapsedMs - originDelay;
      if (localMs <= 0) {
        val.set(0, 0, -10000, -10000);
        return;
      }
      const localProgress = Math.min(localMs / flightDuration, 1);

      // Apply spray stagger within the local flight progress
      const effectiveProgress = interpolate(
        localProgress,
        [launchDelay, 1],
        [0, 1],
        Extrapolation.CLAMP
      );
      const t = effectiveProgress * flightTimeSec;

      // Physics: separate drag for horizontal and vertical axes
      const safeHDrag = Math.max(hDrag, 0.001);
      const safeVDrag = Math.max(vDrag, 0.001);
      const hExpDecay = 1 - Math.exp(-safeHDrag * t);
      const vExpDecay = 1 - Math.exp(-safeVDrag * t);
      const tx = blastX + (vx / safeHDrag) * hExpDecay;
      const ty =
        blastY +
        (scaledGravity / safeVDrag) * t +
        ((vy - scaledGravity / safeVDrag) / safeVDrag) * vExpDecay;

      // Rotation
      const rotationDirection = clockwise ? 1 : -1;
      const rz =
        initialRotation + localProgress * rotationDirection * rotationZ;
      const rx =
        initialRotation + localProgress * rotationDirection * rotationX;

      // Scale: appearance animation at launch + oscillation
      const minFlipScale = 1 - effectiveFlipIntensity;
      const oscillatingScale =
        rotationX === 0
          ? 1
          : Math.max(Math.abs(Math.cos(rx)), minFlipScale);
      const appearScale = interpolate(
        effectiveProgress,
        [0, 0.05],
        [initialScale, 1],
        Extrapolation.CLAMP
      );
      const scale = appearScale * oscillatingScale * depthScale;

      const size = sizeVariations[sizeIndex];
      if (!size) {
        val.set(0, 0, -10000, -10000);
        return;
      }
      const px = size.width / 2;
      const py = size.height / 2;

      const s = Math.sin(rz) * scale;
      const c = Math.cos(rz) * scale;

      val.set(c, s, tx - c * px + s * py, ty - s * px - c * py);
    });

    useLayoutEffect(() => {
      return () => {
        transforms.set([]);
        sprites.set([]);
      };
    }, [sprites, transforms]);

    return (
      <ConfettiCanvas
        containerStyle={containerStyle}
        ready={ready && reduceMotionReady}
        texture={texture}
        sprites={sprites}
        transforms={transforms}
        opacity={opacity}
        onContainerLayout={onContainerLayout}
      />
    );
  }
);

PIConfettiInner.displayName = 'PIConfetti';

const PIConfetti = PIConfettiInner as typeof PIConfettiInner & {
  Origin: typeof Origin;
  Flake: typeof Flake;
};

PIConfetti.Origin = Origin;
PIConfetti.Flake = Flake;

export { PIConfetti };
