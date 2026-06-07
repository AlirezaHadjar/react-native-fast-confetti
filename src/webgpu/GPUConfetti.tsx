import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from 'react';
import { runOnUI, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { GPUConfettiCanvas } from './GPUConfettiCanvas';
import {
  DEFAULT_BOXES_COUNT,
  DEFAULT_CONFETTI_DRIFT,
  DEFAULT_CONFETTI_FALL_EASING,
  DEFAULT_CONFETTI_GRAVITY,
  DEFAULT_CONFETTI_WOBBLE,
  DEFAULT_VERTICAL_SPACING,
} from '../constants';
import {
  DEFAULT_MAGNUS_STRENGTH,
  DEFAULT_WIND_STRENGTH,
} from './constants';
import { Flake } from '../FlakeComponent';
import { useSimulationLifecycle } from './hooks/useSimulationLifecycle';
import { useConfettiFlakes } from '../hooks/useConfettiFlakes';
import { useContainerDimensions } from '../hooks/useContainerDimensions';
import { useTextureProps } from '../hooks/useTextureProps';
import { computeSizeFlags } from './resourcePacking';
import type {
  GPUConfettiMethods,
  GPUConfettiProps,
  InternalGPUConfettiProps,
} from './types';
import {
  computeSpawnGrid,
  estimateFallingDuration,
  generateSpawnsArray,
} from './utils';

const ConfettiInner = forwardRef<
  GPUConfettiMethods,
  InternalGPUConfettiProps
>(
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
      ...textureRootProps
    },
    ref
  ) => {
    const { containerWidth, containerHeight, onContainerLayout, ready } =
      useContainerDimensions(containerStyle);

    const parentTexture = useTextureProps(textureRootProps);

    const {
      allColors,
      sizeVariations,
      colorOverrides,
      parentColorCount,
    } = useConfettiFlakes({
      children,
      rootColors,
      rootFlakeStyle: flakeStyle,
      parentTexture,
    });

    const maxFlakeWidth = Math.max(...sizeVariations.map((f) => f.width));
    const maxFlakeHeight = Math.max(...sizeVariations.map((f) => f.height));
    const { columnsNum, columnWidth, rowsNum, verticalOffset } =
      computeSpawnGrid({
        count,
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

    const {
      elapsed,
      running,
      cycleCount,
      opacity,
      pause,
      resume,
      reset,
      beginCycle,
      bumpCycle,
    } = useSimulationLifecycle({ fadeOutOnEnd });

    const [seed, setSeed] = useState(0);
    const bumpSeed = useCallback(() => setSeed((s) => s + 1), []);

    const spawns = useMemo(() => {
      void seed;
      if (!ready || containerWidth <= 0 || containerHeight <= 0) return null;
      const sizeFlagsByIndex = computeSizeFlags(sizeVariations);
      return generateSpawnsArray({
        count,
        sizeVariations: sizeVariations.length,
        sizeColorOverrides: colorOverrides,
        parentColorCount,
        sizeFlagsByIndex,
        containerWidth,
        containerHeight,
        verticalSpacing,
        maxFlakeWidth,
        maxFlakeHeight,
        verticalOffset,
        columnsNum,
        columnWidth,
        rowsNum,
        rotation,
        depth,
        wobble,
        totalTime: cycleDuration,
        gravity,
        infinite,
        continuous,
      });
    }, [
      seed,
      ready,
      count,
      sizeVariations,
      colorOverrides,
      parentColorCount,
      containerWidth,
      containerHeight,
      verticalSpacing,
      maxFlakeWidth,
      maxFlakeHeight,
      verticalOffset,
      columnsNum,
      columnWidth,
      rowsNum,
      rotation,
      depth,
      wobble,
      cycleDuration,
      gravity,
      infinite,
      continuous,
    ]);
    const hasSpawns = spawns !== null;

    const restart = useCallback(() => {
      'worklet';
      scheduleOnRN(bumpSeed);
      beginCycle();
    }, [bumpSeed, beginCycle]);

    useImperativeHandle(ref, () => ({
      pause: runOnUI(pause),
      reset: runOnUI(reset),
      resume: runOnUI(resume),
      restart: runOnUI(restart),
    }));

    // onAllOffScreen: GPU reported every piece is off-viewport. If we're in
    // infinite mode, re-seed + restart the cycle. Otherwise fire end callback.
    const handleAllOffScreen = useCallback(() => {
      if (infinite) {
        bumpSeed();
        runOnUI(bumpCycle)();
      } else {
        runOnUI(() => {
          'worklet';
          running.set(false);
        })();
        onAnimationEnd?.();
      }
    }, [infinite, bumpSeed, bumpCycle, running, onAnimationEnd]);

    useEffect(() => {
      if (!ready || !hasSpawns) return;
      if (!autoplay) return;
      const t = setTimeout(() => {
        if (running.get()) return;
        runOnUI(beginCycle)();
        onAnimationStart?.();
      }, autoStartDelay);
      return () => clearTimeout(t);
    }, [
      ready,
      autoplay,
      autoStartDelay,
      running,
      beginCycle,
      onAnimationStart,
      hasSpawns,
    ]);

    // Default gravity direction is +Y (down). Caller can override with a
    // SharedValue (e.g. driven by gyroscope).
    const defaultGravityDir = useSharedValue<[number, number, number]>([0, 1, 0]);
    const gravityDir = externalGravityDir ?? defaultGravityDir;

    const gravityPxPerSec2 = gravity * containerHeight;

    const params = useMemo(
      () => ({
        windStrength,
        magnusStrength,
        flipIntensity,
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
        windStrength,
        magnusStrength,
        flipIntensity,
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
        containerStyle={containerStyle}
        onContainerLayout={onContainerLayout}
        count={count}
        sizeVariations={sizeVariations}
        allColors={allColors}
        spawns={spawns}
        cycleDuration={autoRestart ? cycleDuration : 0}
        elapsed={elapsed}
        cycleCount={cycleCount}
        opacity={opacity}
        onAllOffScreen={handleAllOffScreen}
        drift={drift}
        initialScale={initialScale}
        continuous={continuous}
        infinite={infinite}
        fadeOutOnEnd={fadeOutOnEnd}
        gravityPxPerSec2={gravityPxPerSec2}
        viewportWidth={containerWidth}
        viewportHeight={containerHeight}
        params={params}
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
