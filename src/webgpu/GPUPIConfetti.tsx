import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
  type ForwardRefExoticComponent,
  type RefAttributes,
} from 'react';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';

import {
  DEFAULT_PI_CONFETTI_DRAG,
  DEFAULT_PI_CONFETTI_GRAVITY,
  DEFAULT_PI_CONFETTI_LAUNCH_DELAY_MAX,
} from '../constants';
import { Flake, Origin } from '../PIConfettiComponents';
import { useAnimationLifecycle } from '../hooks/useAnimationLifecycle';
import { useContainerDimensions } from '../hooks/useContainerDimensions';
import { usePIOrigins } from '../hooks/usePIOrigins';
import { useTextureProps } from '../hooks/useTextureProps';
import { useReduceMotionFactor } from '../hooks/useReduceMotionFactor';
import { scaleValueForMotion } from '../reduceMotion';
import type {
  PIConfettiMethods,
  PIConfettiRestartOptions,
  Position,
} from '../types';
import { estimatePIDuration, resolveNamedPosition } from '../utils';
import { toPIBurstOrigins } from './burstResourcePacking';
import { GPUBurstConfettiCanvas } from './GPUBurstConfettiCanvas';
import type { GPUPIConfettiProps } from './types';

type RestartState = {
  seed: number;
  positions: Position[] | null;
  delays: number[] | null;
};

type StartRequest = {
  nonce: number;
  delay: number;
  notifyStart: boolean;
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
    const [startRequest, setStartRequest] = useState<StartRequest>({
      nonce: 0,
      delay: 0,
      notifyStart: true,
    });
    const [rendererReady, setRendererReady] = useState(false);

    const requestStart = useCallback((delay = 0, notifyStart = true) => {
      setStartRequest((request) => ({
        nonce: request.nonce + 1,
        delay,
        notifyStart,
      }));
    }, []);

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

    const prepareNextCycle = useCallback(() => {
      setRendererReady(false);
      setRestartState((state) => ({ ...state, seed: state.seed + 1 }));
      requestStart(0, false);
    }, [requestStart]);

    const onCycleEnd = useCallback(() => {
      'worklet';
      scheduleOnRN(prepareNextCycle);
    }, [prepareNextCycle]);

    const { progress, running, opacity, pause, reset, resume, runAnimation } =
      useAnimationLifecycle({
        duration: totalDuration,
        infinite,
        fadeOutOnEnd,
        easing,
        onAnimationStart,
        onAnimationEnd,
        fadeRange: [0.5, 0.9],
        onCycleEnd,
        deferInfiniteRestart: true,
        disabled: visibleCount === 0,
      });

    const initialization = useMemo(
      () => ({
        seed: restartState.seed,
        layoutCount: totalCount,
        containerHeight,
        launchDelayMax,
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
        ready,
        piConfigs,
        currentBlastPositions,
        currentOriginDelays,
      ]
    );
    const renderCount = ready && reduceMotionReady ? visibleCount : 0;

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
      [containerWidth, containerHeight, requestStart]
    );

    useImperativeHandle(ref, () => ({
      pause: () => scheduleOnUI(pause),
      reset: () => scheduleOnUI(reset),
      resume: () => scheduleOnUI(resume),
      restart: jsRestart,
    }));

    useEffect(() => {
      if (!ready || !reduceMotionReady || !rendererReady || renderCount === 0)
        return;
      if (!autoplay) return;
      if (startRequest.nonce !== 0) return;
      if (running.get()) return;
      scheduleOnUI(runAnimation, autoStartDelay);
    }, [
      ready,
      renderCount,
      autoplay,
      autoStartDelay,
      running,
      runAnimation,
      reduceMotionReady,
      rendererReady,
      startRequest.nonce,
    ]);

    useEffect(() => {
      if (startRequest.nonce === 0) return;
      if (!ready || !reduceMotionReady || !rendererReady || renderCount === 0)
        return;
      scheduleOnUI(runAnimation, startRequest.delay, startRequest.notifyStart);
    }, [
      startRequest,
      ready,
      reduceMotionReady,
      renderCount,
      rendererReady,
      runAnimation,
    ]);

    return (
      <GPUBurstConfettiCanvas
        containerStyle={containerStyle}
        onContainerLayout={onContainerLayout}
        count={renderCount}
        initialization={initialization}
        sizeVariations={sizeVariations}
        allColors={allColors}
        colorOverrides={colorOverrides}
        parentColorCount={parentColorCount}
        totalDuration={totalDuration}
        flightDuration={flightDuration}
        progress={progress}
        running={running}
        opacity={opacity}
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
