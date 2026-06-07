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
import { runOnUI } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

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
import type {
  CannonConfettiMethods,
  CannonConfettiRestartOptions,
  NamedPosition,
  Position,
} from '../types';
import {
  estimateCannonDuration,
  generateCannonBoxesArray,
  resolveNamedPosition,
  type CannonConfig,
} from '../utils';
import { toCannonBurstParticles } from './burstResourcePacking';
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
      ...textureRootProps
    },
    ref
  ) => {
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
      allColors,
      sizeVariations,
      colorOverrides,
      sizeIsTextured,
      parentColorCount,
      totalCount,
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
    });

    const [restartState, setRestartState] = useState<RestartState>({
      seed: 0,
      positions: null,
      configs: null,
    });
    const [startRequest, setStartRequest] = useState<StartRequest>({
      nonce: 0,
      delay: 0,
    });

    const currentCannonsPositions =
      restartState.positions ?? cannonsPositions;
    const currentCannonConfigs = restartState.configs ?? cannonConfigs;

    const duration = estimateCannonDuration({
      cannonConfigs: currentCannonConfigs,
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

    const bumpSeed = useCallback(() => {
      setRestartState((state) => ({ ...state, seed: state.seed + 1 }));
    }, []);

    const onCycleEnd = useCallback(() => {
      'worklet';
      scheduleOnRN(bumpSeed);
    }, [bumpSeed]);

    const { progress, running, opacity, pause, reset, resume, runAnimation } =
      useAnimationLifecycle({
        duration,
        infinite,
        fadeOutOnEnd,
        easing,
        onAnimationStart,
        onAnimationEnd,
        onCycleEnd,
      });

    const boxes = useMemo(() => {
      void restartState.seed;
      if (!ready || totalCount <= 0) return [];
      return generateCannonBoxesArray({
        cannonConfigs: currentCannonConfigs,
        cannonsPositions: currentCannonsPositions,
        containerHeight,
        launchDelayMax,
        sizeColorOverrides: colorOverrides,
        parentColorCount,
        sizeIsTextured,
      });
    }, [
      restartState.seed,
      ready,
      totalCount,
      currentCannonConfigs,
      currentCannonsPositions,
      containerHeight,
      launchDelayMax,
      colorOverrides,
      parentColorCount,
      sizeIsTextured,
    ]);

    const particles = useMemo(
      () => toCannonBurstParticles(boxes, currentCannonsPositions),
      [boxes, currentCannonsPositions]
    );

    const requestStart = useCallback((delay = 0) => {
      setStartRequest((request) => ({
        nonce: request.nonce + 1,
        delay,
      }));
    }, []);

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
              spread: DEFAULT_CANNON_CONFETTI_SPREAD_ANGLE,
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
        rootTarget,
        sizeVariations.length,
        totalCount,
      ]
    );

    useImperativeHandle(ref, () => ({
      pause: runOnUI(pause),
      reset: runOnUI(reset),
      resume: runOnUI(resume),
      restart: jsRestart,
    }));

    useEffect(() => {
      if (!ready || particles.length === 0) return;
      if (!autoplay) return;
      if (running.get()) return;
      runOnUI(runAnimation)(autoStartDelay);
    }, [
      ready,
      particles.length,
      autoplay,
      autoStartDelay,
      running,
      runAnimation,
    ]);

    useEffect(() => {
      if (startRequest.nonce === 0) return;
      if (!ready || particles.length === 0) return;
      runOnUI(runAnimation)(startRequest.delay);
    }, [startRequest, ready, particles.length, runAnimation]);

    return (
      <GPUBurstConfettiCanvas
        containerStyle={containerStyle}
        onContainerLayout={onContainerLayout}
        particles={particles}
        sizeVariations={sizeVariations}
        allColors={allColors}
        totalDuration={duration}
        flightDuration={duration}
        progress={progress}
        opacity={opacity}
        gravityPxPerSec2={gravity * containerHeight}
        horizontalDrag={horizontalDrag}
        verticalDrag={verticalDrag}
        initialScale={initialScale}
        flipIntensity={flipIntensity}
        viewportWidth={containerWidth}
        viewportHeight={containerHeight}
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
