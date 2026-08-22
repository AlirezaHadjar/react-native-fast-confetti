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
  DEFAULT_CANNON_CONFETTI_DRAG,
  DEFAULT_CANNON_CONFETTI_GRAVITY,
  DEFAULT_CANNON_CONFETTI_INITIAL_SPEED,
  DEFAULT_CANNON_CONFETTI_LAUNCH_DELAY_MAX,
  DEFAULT_CANNON_CONFETTI_SPEED_VARIATION,
  DEFAULT_CANNON_CONFETTI_SPREAD_ANGLE,
} from '../constants';
import { Flake, Origin } from '../CannonConfettiComponents';
import { useAnimationLifecycle } from '../hooks/useAnimationLifecycle';
import { useCannonOrigins } from '../hooks/useCannonOrigins';
import { useContainerDimensions } from '../hooks/useContainerDimensions';
import { useTextureProps } from '../hooks/useTextureProps';
import { useReduceMotionFactor } from '../hooks/useReduceMotionFactor';
import { scaleValueForMotion } from '../reduceMotion';
import type {
  CannonConfettiMethods,
  CannonConfettiRestartOptions,
  NamedPosition,
  Position,
} from '../types';
import {
  estimateCannonDuration,
  resolveNamedPosition,
  type CannonConfig,
} from '../utils';
import { toCannonBurstOrigins } from './burstResourcePacking';
import { GPUBurstConfettiCanvas } from './GPUBurstConfettiCanvas';
import type { GPUCannonConfettiProps } from './types';

type RestartState = {
  seed: number;
  positions: Position[] | null;
  configs: CannonConfig[] | null;
};

type StartRequest = {
  nonce: number;
  delay: number;
  notifyStart: boolean;
};

const CannonConfettiInner = forwardRef<
  CannonConfettiMethods,
  GPUCannonConfettiProps
>(
  (
    {
      children,
      gravity = DEFAULT_CANNON_CONFETTI_GRAVITY,
      drag: dragProp = DEFAULT_CANNON_CONFETTI_DRAG,
      autoplay = true,
      infinite = false,
      fadeOutOnEnd = false,
      autoStartDelay = 0,
      onAnimationEnd,
      onAnimationStart,
      containerStyle,
      colors: rootColors,
      rotation: rootRotation,
      depth: rootDepth,
      speedVariation: rootSpeedVariation,
      target: rootTarget,
      sprayDuration = 300,
      initialScale = 0.3,
      flipIntensity = 0.85,
      flakeStyle = 'glossy',
      easing,
      reduceMotion,
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
      cannonsPositions,
      cannonConfigs,
      durationCannonConfigs,
      allColors,
      sizeVariations,
      colorOverrides,
      parentColorCount,
      totalCount,
      visibleCount,
    } = useCannonOrigins({
      children,
      rootColors,
      rootRotation,
      rootDepth,
      rootSpeedVariation,
      rootTarget,
      rootFlakeStyle: flakeStyle,
      containerWidth,
      containerHeight,
      parentTexture,
      reduceMotionFactor,
    });

    const [restartState, setRestartState] = useState<RestartState>({
      seed: 0,
      positions: null,
      configs: null,
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

    const currentCannonsPositions = restartState.positions ?? cannonsPositions;
    const currentCannonConfigs = restartState.configs ?? cannonConfigs;

    const duration = estimateCannonDuration({
      cannonConfigs:
        restartState.configs === null
          ? durationCannonConfigs
          : currentCannonConfigs,
      cannonsPositions: currentCannonsPositions,
      gravity,
      drag: verticalDrag,
      sprayDurationMs: sprayDuration,
      containerHeight,
    });

    const launchDelayMax =
      sprayDuration !== undefined
        ? Math.min(sprayDuration / duration, 1)
        : DEFAULT_CANNON_CONFETTI_LAUNCH_DELAY_MAX;

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
        duration,
        infinite,
        fadeOutOnEnd,
        easing,
        onAnimationStart,
        onAnimationEnd,
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
            ? toCannonBurstOrigins(
                currentCannonConfigs,
                currentCannonsPositions
              )
            : [],
      }),
      [
        restartState.seed,
        totalCount,
        containerHeight,
        launchDelayMax,
        ready,
        currentCannonConfigs,
        currentCannonsPositions,
      ]
    );
    const renderCount = ready && reduceMotionReady ? visibleCount : 0;

    const jsRestart = useCallback(
      (options: CannonConfettiRestartOptions = {}) => {
        let resolvedPositions: Position[] | null = null;
        let resolvedConfigs: CannonConfig[] | null = null;

        if (options.origins && options.origins.length > 0) {
          resolvedPositions = options.origins.map((origin) =>
            resolveNamedPosition(origin, containerWidth, containerHeight)
          );
          const perOriginCount = Math.max(
            1,
            Math.floor(totalCount / resolvedPositions.length)
          );

          const defaultTarget: Position =
            rootTarget != null
              ? resolveNamedPosition(
                  rootTarget,
                  containerWidth,
                  containerHeight
                )
              : { x: containerWidth / 2, y: 0 };

          resolvedConfigs = resolvedPositions.map((_, index) => {
            const target =
              options.targets?.[index] != null
                ? resolveNamedPosition(
                    options.targets[index] as NamedPosition | Position,
                    containerWidth,
                    containerHeight
                  )
                : defaultTarget;

            return {
              spread: scaleValueForMotion(
                DEFAULT_CANNON_CONFETTI_SPREAD_ANGLE,
                reduceMotionFactor
              ),
              speed: DEFAULT_CANNON_CONFETTI_INITIAL_SPEED,
              count: perOriginCount,
              speedVariation: {
                ...DEFAULT_CANNON_CONFETTI_SPEED_VARIATION,
              },
              colorStart: 0,
              colorCount: allColors.length,
              sizeStart: 0,
              sizeCount: sizeVariations.length,
              target,
            };
          });
        }

        setRendererReady(false);
        setRestartState((state) => ({
          seed: state.seed + 1,
          positions: resolvedPositions,
          configs: resolvedConfigs,
        }));
        requestStart();
      },
      [
        allColors.length,
        containerWidth,
        containerHeight,
        requestStart,
        reduceMotionFactor,
        rootTarget,
        sizeVariations.length,
        totalCount,
      ]
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
        totalDuration={duration}
        flightDuration={duration}
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

CannonConfettiInner.displayName = 'CannonConfetti';

const CannonConfetti = CannonConfettiInner as ForwardRefExoticComponent<
  GPUCannonConfettiProps & RefAttributes<CannonConfettiMethods>
> & {
  Origin: typeof Origin;
  Flake: typeof Flake;
};

CannonConfetti.Origin = Origin;
CannonConfetti.Flake = Flake;

export { CannonConfetti };
