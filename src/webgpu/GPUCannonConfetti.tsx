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
  DEFAULT_CANNON_CONFETTI_DRAG,
  DEFAULT_CANNON_CONFETTI_GRAVITY,
  DEFAULT_CANNON_CONFETTI_INITIAL_SPEED,
  DEFAULT_CANNON_CONFETTI_LAUNCH_DELAY_MAX,
  DEFAULT_CANNON_CONFETTI_SPEED_VARIATION,
  DEFAULT_CANNON_CONFETTI_SPREAD_ANGLE,
  DEFAULT_FLAKE_STYLE,
  DEFAULT_FLIP_INTENSITY,
  DEFAULT_INITIAL_SCALE,
} from '../constants';
import { Flake, Origin } from '../CannonConfettiComponents';
import { useCannonOrigins } from '../hooks/useCannonOrigins';
import { useContainerDimensions } from '../hooks/useContainerDimensions';
import { useTextureProps } from '../hooks/useTextureProps';
import { useReduceMotionFactor } from '../hooks/useReduceMotionFactor';
import {
  isReduceMotionPieceVisible,
  reduceCountForMotion,
  scaleValueForMotion,
} from '../reduceMotion';
import { resolveOpacityAnimation } from '../fadeOut';
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
import {
  toCannonBurstOrigins,
  toCannonPresetParticles,
} from './burstResourcePacking';
import { GPUBurstConfettiCanvas } from './GPUBurstConfettiCanvas';
import type { GPUCannonConfettiProps } from './types';
import {
  estimateFloorSettlingDuration,
  resolveSettleOnFloor,
} from './settleOnFloor';
import { useBurstConfettiController } from './hooks/useBurstConfettiController';

type RestartState = {
  seed: number;
  positions: Position[] | null;
  configs: CannonConfig[] | null;
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
      opacityAnimation,
      autoStartDelay = 0,
      onAnimationEnd,
      onAnimationStart,
      containerStyle,
      colors: rootColors,
      rotation: rootRotation,
      depth: rootDepth,
      speedVariation: rootSpeedVariation,
      target: rootTarget,
      particleSystem,
      sprayDuration = 300,
      initialScale = DEFAULT_INITIAL_SCALE,
      flipIntensity = DEFAULT_FLIP_INTENSITY,
      flakeStyle = DEFAULT_FLAKE_STYLE,
      easing,
      reduceMotion,
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
    const currentCannonsPositions = restartState.positions ?? cannonsPositions;
    const currentCannonConfigs = restartState.configs ?? cannonConfigs;

    const duration = particleSystem
      ? particleSystem.duration
      : estimateCannonDuration({
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
    const resolvedFloor = useMemo(
      () => resolveSettleOnFloor(settleOnFloor),
      [settleOnFloor]
    );
    const settlingDurationSeconds = particleSystem
      ? 0
      : estimateFloorSettlingDuration(resolvedFloor);
    const cycleDuration = duration + settlingDurationSeconds * 1000;
    const resolvedOpacityAnimation = useMemo(
      () => resolveOpacityAnimation(opacityAnimation),
      [opacityAnimation]
    );
    const presetVisibleCount = particleSystem
      ? reduceCountForMotion(
          particleSystem.particles.length,
          reduceMotionFactor
        )
      : 0;
    const presetParticles = useMemo(() => {
      if (!particleSystem) return null;
      return toCannonPresetParticles(particleSystem, cannonConfigs).filter(
        (_, index) =>
          isReduceMotionPieceVisible(
            index,
            particleSystem.particles.length,
            presetVisibleCount
          )
      );
    }, [particleSystem, cannonConfigs, presetVisibleCount]);
    const renderCount =
      ready && reduceMotionReady
        ? (presetParticles?.length ?? visibleCount)
        : 0;
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
      ready: ready && reduceMotionReady,
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
        flightDurationSeconds: duration / 1000,
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
        duration,
        ready,
        currentCannonConfigs,
        currentCannonsPositions,
      ]
    );
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
        setRendererReady,
        rootTarget,
        sizeVariations.length,
        totalCount,
      ]
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
        presetParticles={presetParticles}
        presetViewportPadding={particleSystem?.viewportPadding ?? 0.08}
        sizeVariations={sizeVariations}
        allColors={allColors}
        colorOverrides={colorOverrides}
        parentColorCount={parentColorCount}
        cycleDuration={cycleDuration}
        flightDuration={duration}
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
