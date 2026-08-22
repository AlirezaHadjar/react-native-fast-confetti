import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';

import { GPUConfettiCanvas } from './GPUConfettiCanvas';
import {
  DEFAULT_BOXES_COUNT,
  DEFAULT_CONFETTI_DEPTH,
  DEFAULT_CONFETTI_DRIFT,
  DEFAULT_CONFETTI_FALL_EASING,
  DEFAULT_CONFETTI_GRAVITY,
  DEFAULT_CONFETTI_ROTATION,
  DEFAULT_CONFETTI_WOBBLE,
  DEFAULT_VERTICAL_SPACING,
} from '../constants';
import {
  DEFAULT_MAGNUS_STRENGTH,
  DEFAULT_WIND_STRENGTH,
  DEFAULT_Z_RANGE,
} from './constants';
import { Flake } from '../FlakeComponent';
import { useSimulationLifecycle } from './hooks/useSimulationLifecycle';
import { useConfettiFlakes } from '../hooks/useConfettiFlakes';
import { useContainerDimensions } from '../hooks/useContainerDimensions';
import { useTextureProps } from '../hooks/useTextureProps';
import { useReduceMotionFactor } from '../hooks/useReduceMotionFactor';
import { useLatestCallback } from '../hooks/useLatestCallback';
import { reduceCountForMotion, scaleValueForMotion } from '../reduceMotion';
import type {
  GPUConfettiMethods,
  GPUConfettiProps,
  InternalGPUConfettiProps,
} from './types';
import type { FixedLengthArray } from '../typeHelpers';
import {
  computeSpawnGrid,
  estimateFallingDuration,
  resolveRange,
} from './utils';

const ConfettiInner = forwardRef<GPUConfettiMethods, InternalGPUConfettiProps>(
  (
    {
      children,
      count = DEFAULT_BOXES_COUNT,
      colors: rootColors,
      gravity = DEFAULT_CONFETTI_GRAVITY,
      wobble,
      drift = DEFAULT_CONFETTI_DRIFT,
      autoplay = true,
      infinite = false,
      continuous = false,
      fadeOutOnEnd = false,
      autoStartDelay = 0,
      onAnimationEnd,
      onAnimationStart,
      containerStyle,
      rotation,
      depth,
      verticalSpacing = DEFAULT_VERTICAL_SPACING,
      flakeStyle = 'glossy',
      initialScale = 0.3,
      flipIntensity = 0.85,
      easing = DEFAULT_CONFETTI_FALL_EASING,
      reduceMotion,
      windStrength = DEFAULT_WIND_STRENGTH,
      magnusStrength = DEFAULT_MAGNUS_STRENGTH,
      autoRestart = true,
      bounceRestitution = 0.3,
      floorFriction = 0.92,
      motionBlurAmount = 0.0,
      shadowOpacity = 0.35,
      iridescence = 0,
      textureMode = 0,
      gravityDir: externalGravityDir,
      device,
      ...textureRootProps
    },
    ref
  ) => {
    const { factor: reduceMotionFactor, ready: reduceMotionReady } =
      useReduceMotionFactor(reduceMotion);
    const bufferCount = Math.max(0, Math.round(count));
    const visibleCount = reduceCountForMotion(bufferCount, reduceMotionFactor);
    const effectiveDrift = scaleValueForMotion(drift, reduceMotionFactor);
    const effectiveFlipIntensity = scaleValueForMotion(
      flipIntensity,
      reduceMotionFactor
    );
    const effectiveWindStrength = scaleValueForMotion(
      windStrength,
      reduceMotionFactor
    );
    const effectiveMagnusStrength = scaleValueForMotion(
      magnusStrength,
      reduceMotionFactor
    );
    const { containerWidth, containerHeight, onContainerLayout, ready } =
      useContainerDimensions(containerStyle);

    const parentTexture = useTextureProps(textureRootProps);

    const { allColors, sizeVariations, colorOverrides, parentColorCount } =
      useConfettiFlakes({
        children,
        rootColors,
        rootFlakeStyle: flakeStyle,
        parentTexture,
      });

    const maxFlakeWidth = Math.max(...sizeVariations.map((f) => f.width));
    const maxFlakeHeight = Math.max(...sizeVariations.map((f) => f.height));
    const { columnsNum, columnWidth, rowsNum, verticalOffset } =
      computeSpawnGrid({
        count: Math.max(bufferCount, 1),
        maxFlakeWidth,
        maxFlakeHeight,
        containerWidth,
        containerHeight,
        verticalSpacing,
      });

    const maxWobble = wobble?.max ?? DEFAULT_CONFETTI_WOBBLE.max;
    const duration = estimateFallingDuration({
      gravity,
      containerHeight,
      verticalOffset,
      maxWobble,
    });
    const cycleDuration = duration / 1000;

    const { running, opacity, pause, resume, reset, beginCycle } =
      useSimulationLifecycle({ fadeOutOnEnd });

    const [seed, setSeed] = useState(0);
    const [resetRevision, setResetRevision] = useState(0);
    const [rendererReady, setRendererReady] = useState(false);
    const autoplayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const autoplaySuppressedRef = useRef(false);
    const autoplayConfigRef = useRef({ autoplay, autoStartDelay });
    const notifyAnimationStart = useLatestCallback(onAnimationStart);
    const clearPendingAutoplay = useCallback(() => {
      if (autoplayTimerRef.current === null) return;
      clearTimeout(autoplayTimerRef.current);
      autoplayTimerRef.current = null;
    }, []);
    const suppressPendingAutoplay = useCallback(() => {
      autoplaySuppressedRef.current = true;
      clearPendingAutoplay();
    }, [clearPendingAutoplay]);
    const bumpSeed = useCallback(() => setSeed((s) => s + 1), []);
    const bumpResetRevision = useCallback(
      () => setResetRevision((revision) => revision + 1),
      []
    );
    const handleRestart = useCallback(() => {
      bumpSeed();
      notifyAnimationStart();
    }, [bumpSeed, notifyAnimationStart]);

    const rotationXMin = rotation?.x?.min;
    const rotationXMax = rotation?.x?.max;
    const rotationZMin = rotation?.z?.min;
    const rotationZMax = rotation?.z?.max;
    const depthMin = depth?.min;
    const depthMax = depth?.max;
    const wobbleMin = wobble?.min;
    const wobbleMax = wobble?.max;

    const initialization = useMemo(() => {
      const effectiveRotationX =
        rotationXMin === undefined || rotationXMax === undefined
          ? undefined
          : {
              min: scaleValueForMotion(rotationXMin, reduceMotionFactor),
              max: scaleValueForMotion(rotationXMax, reduceMotionFactor),
            };
      const effectiveRotationZ =
        rotationZMin === undefined || rotationZMax === undefined
          ? undefined
          : {
              min: scaleValueForMotion(rotationZMin, reduceMotionFactor),
              max: scaleValueForMotion(rotationZMax, reduceMotionFactor),
            };
      const effectiveDepth =
        depthMin === undefined || depthMax === undefined
          ? undefined
          : { min: depthMin, max: depthMax };
      const effectiveWobble =
        wobbleMin === undefined || wobbleMax === undefined
          ? undefined
          : {
              min: scaleValueForMotion(wobbleMin, reduceMotionFactor),
              max: scaleValueForMotion(wobbleMax, reduceMotionFactor),
            };
      const rotationX = resolveRange(
        effectiveRotationX,
        DEFAULT_CONFETTI_ROTATION.x
      );
      const rotationZ = resolveRange(
        effectiveRotationZ,
        DEFAULT_CONFETTI_ROTATION.z
      );
      const depthRange = resolveRange(effectiveDepth, DEFAULT_CONFETTI_DEPTH);
      const wobbleRange = resolveRange(
        effectiveWobble,
        DEFAULT_CONFETTI_WOBBLE
      );

      return {
        seed,
        revision: resetRevision,
        layoutCount: bufferCount,
        columnsNum,
        rowsNum,
        columnWidth,
        verticalSpacing,
        maxFlakeWidth,
        maxFlakeHeight,
        verticalOffset,
        rotationX: [rotationX.min, rotationX.max] as const,
        rotationZ: [rotationZ.min, rotationZ.max] as const,
        depth: [depthRange.min, depthRange.max] as const,
        wobble: [wobbleRange.min, wobbleRange.max] as const,
        zRange: DEFAULT_Z_RANGE,
        cycleDuration,
        gravity,
      };
    }, [
      seed,
      resetRevision,
      bufferCount,
      verticalSpacing,
      maxFlakeWidth,
      maxFlakeHeight,
      verticalOffset,
      columnsNum,
      columnWidth,
      rowsNum,
      rotationXMin,
      rotationXMax,
      rotationZMin,
      rotationZMax,
      depthMin,
      depthMax,
      wobbleMin,
      wobbleMax,
      reduceMotionFactor,
      cycleDuration,
      gravity,
    ]);
    const hasParticles =
      ready &&
      reduceMotionReady &&
      visibleCount > 0 &&
      containerWidth > 0 &&
      containerHeight > 0;

    const restart = useCallback(() => {
      'worklet';
      scheduleOnRN(handleRestart);
      beginCycle();
    }, [handleRestart, beginCycle]);

    const resetAndReinitialize = useCallback(() => {
      'worklet';
      reset();
      scheduleOnRN(bumpResetRevision);
    }, [bumpResetRevision, reset]);

    const imperativePause = useCallback(() => {
      suppressPendingAutoplay();
      scheduleOnUI(pause);
    }, [pause, suppressPendingAutoplay]);
    const imperativeReset = useCallback(() => {
      suppressPendingAutoplay();
      scheduleOnUI(resetAndReinitialize);
    }, [resetAndReinitialize, suppressPendingAutoplay]);
    const imperativeResume = useCallback(() => {
      suppressPendingAutoplay();
      scheduleOnUI(resume);
    }, [resume, suppressPendingAutoplay]);
    const imperativeRestart = useCallback(() => {
      suppressPendingAutoplay();
      scheduleOnUI(restart);
    }, [restart, suppressPendingAutoplay]);

    useImperativeHandle(ref, () => ({
      pause: imperativePause,
      reset: imperativeReset,
      resume: imperativeResume,
      restart: imperativeRestart,
    }));

    // onAllOffScreen: GPU reported every piece is off-viewport. Infinite mode
    // recycles particles in the compute shader, so it should not re-seed.
    const handleAllOffScreen = useCallback(() => {
      if (infinite) {
        return;
      } else {
        scheduleOnUI(() => {
          'worklet';
          running.set(false);
        });
        onAnimationEnd?.();
      }
    }, [infinite, running, onAnimationEnd]);

    useEffect(() => {
      const previousConfig = autoplayConfigRef.current;
      if (
        previousConfig.autoplay !== autoplay ||
        previousConfig.autoStartDelay !== autoStartDelay
      ) {
        autoplayConfigRef.current = { autoplay, autoStartDelay };
        autoplaySuppressedRef.current = false;
      }

      clearPendingAutoplay();
      if (
        ready &&
        reduceMotionReady &&
        hasParticles &&
        rendererReady &&
        autoplay &&
        !autoplaySuppressedRef.current
      ) {
        autoplayTimerRef.current = setTimeout(() => {
          autoplayTimerRef.current = null;
          if (autoplaySuppressedRef.current || running.get()) return;
          scheduleOnUI(beginCycle);
          notifyAnimationStart();
        }, autoStartDelay);
      }
      return () => {
        if (autoplayTimerRef.current === null) return;
        clearTimeout(autoplayTimerRef.current);
        autoplayTimerRef.current = null;
      };
    }, [
      ready,
      autoplay,
      autoStartDelay,
      running,
      beginCycle,
      hasParticles,
      reduceMotionReady,
      rendererReady,
      clearPendingAutoplay,
      notifyAnimationStart,
    ]);

    // Default gravity direction is +Y (down). Caller can override with a
    // SharedValue (e.g. driven by gyroscope).
    const defaultGravityDir = useSharedValue<FixedLengthArray<number, 3>>([
      0, 1, 0,
    ]);
    const gravityDir = externalGravityDir ?? defaultGravityDir;

    const gravityPxPerSec2 = gravity * containerHeight;

    const params = useMemo(
      () => ({
        windStrength: effectiveWindStrength,
        magnusStrength: effectiveMagnusStrength,
        flipIntensity: effectiveFlipIntensity,
        bounceRestitution,
        floorFriction,
        motionBlurAmount,
        shadowOpacity,
        iridescence,
        textureMode,
        easing,
        gravityDir,
      }),
      [
        effectiveWindStrength,
        effectiveMagnusStrength,
        effectiveFlipIntensity,
        bounceRestitution,
        floorFriction,
        motionBlurAmount,
        shadowOpacity,
        iridescence,
        textureMode,
        easing,
        gravityDir,
      ]
    );

    return (
      <GPUConfettiCanvas
        device={device}
        containerStyle={containerStyle}
        onContainerLayout={onContainerLayout}
        count={hasParticles ? visibleCount : 0}
        sizeVariations={sizeVariations}
        allColors={allColors}
        colorOverrides={colorOverrides}
        parentColorCount={parentColorCount}
        initialization={initialization}
        cycleDuration={autoRestart ? cycleDuration : 0}
        running={running}
        opacity={opacity}
        onAllOffScreen={handleAllOffScreen}
        drift={effectiveDrift}
        initialScale={initialScale}
        continuous={continuous}
        infinite={infinite}
        fadeOutOnEnd={fadeOutOnEnd}
        gravityPxPerSec2={gravityPxPerSec2}
        viewportWidth={containerWidth}
        viewportHeight={containerHeight}
        params={params}
        onReadyChange={setRendererReady}
      />
    );
  }
);

ConfettiInner.displayName = 'Confetti';

const Confetti = ConfettiInner as React.ForwardRefExoticComponent<
  GPUConfettiProps & React.RefAttributes<GPUConfettiMethods>
> & { Flake: typeof Flake };

Confetti.Flake = Flake;

export { Confetti };
export { ConfettiInner as InternalConfetti };
