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
  DEFAULT_PI_CONFETTI_DRAG,
  DEFAULT_PI_CONFETTI_GRAVITY,
  DEFAULT_PI_CONFETTI_LAUNCH_DELAY_MAX,
} from '../constants';
import { Flake, Origin } from '../PIConfettiComponents';
import { useAnimationLifecycle } from '../hooks/useAnimationLifecycle';
import { useContainerDimensions } from '../hooks/useContainerDimensions';
import { usePIOrigins } from '../hooks/usePIOrigins';
import { useTextureProps } from '../hooks/useTextureProps';
import type {
  PIConfettiMethods,
  PIConfettiRestartOptions,
  Position,
} from '../types';
import {
  estimatePIDuration,
  generatePIBoxesArray,
  resolveNamedPosition,
} from '../utils';
import {
  toPIBurstParticles,
} from './burstResourcePacking';
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
      onAnimationEnd,
      onAnimationStart,
      containerStyle,
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
      blastPositions,
      originDelays,
      piConfigs,
      allColors,
      sizeVariations,
      colorOverrides,
      sizeIsTextured,
      parentColorCount,
      totalCount,
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
    });

    const [restartState, setRestartState] = useState<RestartState>({
      seed: 0,
      positions: null,
      delays: null,
    });
    const [startRequest, setStartRequest] = useState<StartRequest>({
      nonce: 0,
      delay: 0,
    });

    const currentBlastPositions =
      restartState.positions ?? blastPositions;
    const currentOriginDelays = restartState.delays ?? originDelays;

    const { flightDuration, totalDuration } = estimatePIDuration({
      piConfigs,
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

    const bumpSeed = useCallback(() => {
      setRestartState((state) => ({ ...state, seed: state.seed + 1 }));
    }, []);

    const onCycleEnd = useCallback(() => {
      'worklet';
      scheduleOnRN(bumpSeed);
    }, [bumpSeed]);

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
      });

    const boxes = useMemo(() => {
      void restartState.seed;
      if (!ready || totalCount <= 0) return [];
      return generatePIBoxesArray({
        piConfigs,
        originDelays: currentOriginDelays,
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
      piConfigs,
      currentOriginDelays,
      containerHeight,
      launchDelayMax,
      colorOverrides,
      parentColorCount,
      sizeIsTextured,
    ]);

    const particles = useMemo(
      () => toPIBurstParticles(boxes, currentBlastPositions),
      [boxes, currentBlastPositions]
    );

    const requestStart = useCallback((delay = 0) => {
      setStartRequest((request) => ({
        nonce: request.nonce + 1,
        delay,
      }));
    }, []);

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
        totalDuration={totalDuration}
        flightDuration={flightDuration}
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
