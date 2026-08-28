import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
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
  DEFAULT_FLAKE_STYLE,
  DEFAULT_FLIP_INTENSITY,
  DEFAULT_INITIAL_SCALE,
  DEFAULT_VERTICAL_SPACING,
} from '../constants';
import {
  DEFAULT_MAGNUS_STRENGTH,
  DEFAULT_WIND_STRENGTH,
  DEFAULT_Z_RANGE,
} from './constants';
import { Flake } from '../FlakeComponent';
import { useSimulationLifecycle } from './hooks/useSimulationLifecycle';
import { useRendererAutoplay } from './hooks/useRendererAutoplay';
import { useConfettiFlakes } from '../hooks/useConfettiFlakes';
import { useContainerDimensions } from '../hooks/useContainerDimensions';
import { useTextureProps } from '../hooks/useTextureProps';
import { useReduceMotionFactor } from '../hooks/useReduceMotionFactor';
import { useLatestCallback } from '../hooks/useLatestCallback';
import { resolveOpacityAnimation } from '../fadeOut';
import { reduceCountForMotion, scaleValueForMotion } from '../reduceMotion';
import type {
  GPUConfettiMethods,
  GPUConfettiProps,
  InternalGPUConfettiProps,
} from './types';
import type { FixedLengthArray } from '../typeHelpers';
import { computeSpawnGrid, estimateFallingDuration } from './utils';
import { resolveRange } from '../utils';
import {
  estimateFloorSettlingDuration,
  resolveSettleOnFloor,
} from './settleOnFloor';

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
      opacityAnimation,
      autoStartDelay = 0,
      onAnimationEnd,
      onAnimationStart,
      containerStyle,
      rotation,
      depth,
      verticalSpacing = DEFAULT_VERTICAL_SPACING,
      flakeStyle = DEFAULT_FLAKE_STYLE,
      initialScale = DEFAULT_INITIAL_SCALE,
      flipIntensity = DEFAULT_FLIP_INTENSITY,
      easing = DEFAULT_CONFETTI_FALL_EASING,
      reduceMotion,
      windStrength = DEFAULT_WIND_STRENGTH,
      magnusStrength = DEFAULT_MAGNUS_STRENGTH,
      autoRestart = true,
      settleOnFloor,
      motionBlurAmount = 0.0,
      shadowOpacity = 0.35,
      iridescence = 0,
      textureMode = 0,
      gravityDir: externalGravityDir,
      device,
      onError,
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
    const motionDuration = duration / 1000;

    const resolvedOpacityAnimation = useMemo(
      () => resolveOpacityAnimation(opacityAnimation),
      [opacityAnimation]
    );
    const resolvedFloor = useMemo(
      () => resolveSettleOnFloor(settleOnFloor),
      [settleOnFloor]
    );
    const cycleDuration =
      motionDuration + estimateFloorSettlingDuration(resolvedFloor);
    const {
      running,
      visibility,
      pause,
      resume,
      reset,
      beginCycle,
      completeCycle,
    } = useSimulationLifecycle();

    const [seed, setSeed] = useState(0);
    const [resetRevision, setResetRevision] = useState(0);
    const [rendererReady, setRendererReady] = useState(false);
    const notifyAnimationStart = useLatestCallback(onAnimationStart);
    const notifyAnimationEnd = useLatestCallback(onAnimationEnd);
    const bumpSeed = useCallback(() => setSeed((s) => s + 1), []);
    const bumpResetRevision = useCallback(
      () => setResetRevision((revision) => revision + 1),
      []
    );
    const handleRestart = useCallback(() => {
      bumpSeed();
      notifyAnimationStart();
    }, [bumpSeed, notifyAnimationStart]);
    const notifyEmptyCycle = useCallback(() => {
      notifyAnimationStart();
      notifyAnimationEnd();
    }, [notifyAnimationEnd, notifyAnimationStart]);

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
        cycleDuration: motionDuration,
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
      motionDuration,
      gravity,
    ]);
    const animationReady =
      ready &&
      reduceMotionReady &&
      containerWidth > 0 &&
      containerHeight > 0;
    const hasParticles = animationReady && visibleCount > 0;
    const completeEmptyCycle = useCallback(() => {
      scheduleOnUI(completeCycle);
      notifyEmptyCycle();
    }, [completeCycle, notifyEmptyCycle]);

    const suppressPendingAutoplay = useRendererAutoplay({
      enabled: animationReady && (visibleCount === 0 || rendererReady),
      autoplay,
      autoStartDelay,
      running,
      beginCycle,
      onAnimationStart: notifyAnimationStart,
      empty: visibleCount === 0,
      onEmpty: completeEmptyCycle,
    });

    const restart = useCallback(() => {
      'worklet';
      if (reduceMotionReady && visibleCount === 0) {
        completeCycle();
        scheduleOnRN(notifyEmptyCycle);
        return;
      }
      scheduleOnRN(handleRestart);
      beginCycle();
    }, [
      beginCycle,
      completeCycle,
      handleRestart,
      notifyEmptyCycle,
      reduceMotionReady,
      visibleCount,
    ]);

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

    const handleCycleEnd = useCallback(() => {
      notifyAnimationEnd();
    }, [notifyAnimationEnd]);

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
        settleOnFloor: resolvedFloor.enabled,
        floorRestitution: resolvedFloor.restitution,
        floorFriction: resolvedFloor.friction,
        floorVariation: resolvedFloor.variation,
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
        resolvedFloor.enabled,
        resolvedFloor.restitution,
        resolvedFloor.friction,
        resolvedFloor.variation,
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
        onError={onError}
        containerStyle={containerStyle}
        onContainerLayout={onContainerLayout}
        count={hasParticles ? visibleCount : 0}
        sizeVariations={sizeVariations}
        allColors={allColors}
        colorOverrides={colorOverrides}
        parentColorCount={parentColorCount}
        initialization={initialization}
        cycleDuration={autoRestart ? cycleDuration : 0}
        motionDuration={motionDuration}
        running={running}
        visibility={visibility}
        completeCycle={completeCycle}
        onCycleEnd={handleCycleEnd}
        drift={effectiveDrift}
        initialScale={initialScale}
        continuous={continuous}
        infinite={infinite}
        opacityAnimation={resolvedOpacityAnimation}
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
