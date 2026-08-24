import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useState,
  type ForwardRefExoticComponent,
  type RefAttributes,
} from 'react';
import { scheduleOnUI } from 'react-native-worklets';

import {
  DEFAULT_PI_CONFETTI_DRAG,
  DEFAULT_PI_CONFETTI_GRAVITY,
  DEFAULT_PI_CONFETTI_LAUNCH_DELAY_MAX,
  DEFAULT_FLAKE_STYLE,
  DEFAULT_FLIP_INTENSITY,
  DEFAULT_INITIAL_SCALE,
} from '../constants';
import { Flake, Origin } from '../PIConfettiComponents';
import { useContainerDimensions } from '../hooks/useContainerDimensions';
import { usePIOrigins } from '../hooks/usePIOrigins';
import { useTextureProps } from '../hooks/useTextureProps';
import { useReduceMotionFactor } from '../hooks/useReduceMotionFactor';
import { scaleValueForMotion } from '../reduceMotion';
import { resolveOpacityAnimation } from '../fadeOut';
import type {
  PIConfettiMethods,
  PIConfettiRestartOptions,
  Position,
} from '../types';
import { estimatePIDuration, resolveNamedPosition } from '../utils';
import { toPIBurstOrigins } from './burstResourcePacking';
import { GPUBurstConfettiCanvas } from './GPUBurstConfettiCanvas';
import type { GPUPIConfettiProps } from './types';
import {
  estimateFloorSettlingDuration,
  resolveSettleOnFloor,
} from './settleOnFloor';
import { useBurstConfettiController } from './hooks/useBurstConfettiController';

type RestartState = {
  seed: number;
  positions: Position[] | null;
  delays: number[] | null;
};

const PIConfettiInner = forwardRef<PIConfettiMethods, GPUPIConfettiProps>(
  (
    {
      children,
      colors: rootColors,
      gravity = DEFAULT_PI_CONFETTI_GRAVITY,
      drag: dragProp = DEFAULT_PI_CONFETTI_DRAG,
      autoplay = true,
      infinite = false,
      opacityAnimation,
      autoStartDelay = 0,
      rotation: rootRotation,
      depth: rootDepth,
      speedVariation: rootSpeedVariation,
      flakeStyle = DEFAULT_FLAKE_STYLE,
      initialScale = DEFAULT_INITIAL_SCALE,
      flipIntensity = DEFAULT_FLIP_INTENSITY,
      easing,
      sprayDuration,
      reduceMotion,
      onAnimationEnd,
      onAnimationStart,
      containerStyle,
      settleOnFloor,
      device,
      onError,
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
    const horizontalDrag =
      typeof dragProp === 'number' ? dragProp : dragProp.horizontal;
    const verticalDrag =
      typeof dragProp === 'number' ? dragProp : dragProp.vertical;

    const {
      blastPositions,
      originDelays,
      piConfigs,
      durationPiConfigs,
      allColors,
      sizeVariations,
      colorOverrides,
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

    const [restartState, setRestartState] = useState<RestartState>({
      seed: 0,
      positions: null,
      delays: null,
    });
    const currentBlastPositions = restartState.positions ?? blastPositions;
    const currentOriginDelays = restartState.delays ?? originDelays;

    const { flightDuration, totalDuration } = estimatePIDuration({
      piConfigs: durationPiConfigs,
      blastPositions: currentBlastPositions,
      originDelays: currentOriginDelays,
      gravity,
      vDrag: verticalDrag,
      sprayDurationMs: sprayDuration,
      containerHeight,
    });

    const launchDelayMax =
      sprayDuration !== undefined
        ? Math.min(sprayDuration / totalDuration, 1)
        : DEFAULT_PI_CONFETTI_LAUNCH_DELAY_MAX;
    const resolvedFloor = useMemo(
      () => resolveSettleOnFloor(settleOnFloor),
      [settleOnFloor]
    );
    const settlingDurationSeconds =
      estimateFloorSettlingDuration(resolvedFloor);
    const cycleDuration = totalDuration + settlingDurationSeconds * 1000;
    const resolvedOpacityAnimation = useMemo(
      () => resolveOpacityAnimation(opacityAnimation),
      [opacityAnimation]
    );
    const renderCount = ready && reduceMotionReady ? visibleCount : 0;
    const {
      running,
      visibility,
      resetVersion,
      pause,
      reset,
      resume,
      completeCycle,
      requestStart,
      setRendererReady,
      suppressPendingAutoplay,
      notifyAnimationEnd,
    } = useBurstConfettiController({
      onAnimationStart,
      onAnimationEnd,
      renderCount,
      autoplay,
      autoStartDelay,
    });

    const initialization = useMemo(
      () => ({
        seed: restartState.seed,
        layoutCount: totalCount,
        containerHeight,
        launchDelayMax,
        flightDurationSeconds: flightDuration / 1000,
        origins:
          ready && totalCount > 0
            ? toPIBurstOrigins(
                piConfigs,
                currentBlastPositions,
                currentOriginDelays
              )
            : [],
      }),
      [
        restartState.seed,
        totalCount,
        containerHeight,
        launchDelayMax,
        flightDuration,
        ready,
        piConfigs,
        currentBlastPositions,
        currentOriginDelays,
      ]
    );
    const jsRestart = useCallback(
      (options: PIConfettiRestartOptions = {}) => {
        let resolvedPositions: Position[] | null = null;
        let resolvedDelays: number[] | null = null;
        if (options.origins) {
          resolvedPositions = options.origins.map((origin) =>
            resolveNamedPosition(
              origin.blastPosition,
              containerWidth,
              containerHeight
            )
          );
          resolvedDelays = options.origins.map((origin) => origin.delay ?? 0);
        }

        setRendererReady(false);
        setRestartState((state) => ({
          seed: state.seed + 1,
          positions: resolvedPositions,
          delays: resolvedDelays,
        }));
        requestStart();
      },
      [containerWidth, containerHeight, requestStart, setRendererReady]
    );

    useImperativeHandle(ref, () => ({
      pause: () => {
        suppressPendingAutoplay();
        scheduleOnUI(pause);
      },
      reset: () => {
        suppressPendingAutoplay();
        scheduleOnUI(reset);
      },
      resume: () => {
        suppressPendingAutoplay();
        scheduleOnUI(resume);
      },
      restart: jsRestart,
    }));

    return (
      <GPUBurstConfettiCanvas
        device={device}
        onError={onError}
        containerStyle={containerStyle}
        onContainerLayout={onContainerLayout}
        count={renderCount}
        initialization={initialization}
        sizeVariations={sizeVariations}
        allColors={allColors}
        colorOverrides={colorOverrides}
        parentColorCount={parentColorCount}
        cycleDuration={cycleDuration}
        flightDuration={flightDuration}
        infinite={infinite}
        easing={easing}
        opacityAnimation={resolvedOpacityAnimation}
        floor={resolvedFloor}
        running={running}
        visibility={visibility}
        resetVersion={resetVersion}
        completeCycle={completeCycle}
        onCycleEnd={notifyAnimationEnd}
        gravityPxPerSec2={gravity * containerHeight}
        horizontalDrag={horizontalDrag}
        verticalDrag={verticalDrag}
        initialScale={initialScale}
        flipIntensity={effectiveFlipIntensity}
        viewportWidth={containerWidth}
        viewportHeight={containerHeight}
        onReadyChange={setRendererReady}
      />
    );
  }
);

PIConfettiInner.displayName = 'PIConfetti';

const PIConfetti = PIConfettiInner as ForwardRefExoticComponent<
  GPUPIConfettiProps & RefAttributes<PIConfettiMethods>
> & {
  Origin: typeof Origin;
  Flake: typeof Flake;
};

PIConfetti.Origin = Origin;
PIConfetti.Flake = Flake;

export { PIConfetti };
