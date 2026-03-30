import { useRSXformBuffer } from '@shopify/react-native-skia';
import { useCallback, useEffect, useImperativeHandle, forwardRef } from 'react';
import {
  Extrapolation,
  interpolate,
  runOnUI,
  useSharedValue,
} from 'react-native-reanimated';
import {
  generateCannonBoxesArray,
  resolveNamedPosition,
  estimateCannonDuration,
  type CannonConfig,
} from './utils';
import {
  DEFAULT_CANNON_CONFETTI_GRAVITY,
  DEFAULT_CANNON_CONFETTI_DRAG,
  DEFAULT_CANNON_CONFETTI_INITIAL_SPEED,
  DEFAULT_CANNON_CONFETTI_SPREAD_ANGLE,
  DEFAULT_CANNON_CONFETTI_SPEED_VARIATION,
  DEFAULT_CANNON_CONFETTI_LAUNCH_DELAY_MAX,
} from './constants';
import type {
  CannonConfettiMethods,
  CannonConfettiProps,
  CannonConfettiRestartOptions,
  NamedPosition,
  Position,
} from './types';
import { useConfettiLogic } from './hooks/useConfettiLogic';
import { useCannonOrigins } from './hooks/useCannonOrigins';
import { useAnimationLifecycle } from './hooks/useAnimationLifecycle';
import { useContainerDimensions } from './hooks/useContainerDimensions';
import { ConfettiCanvas } from './ConfettiCanvas';
import { Origin, Flake } from './CannonConfettiComponents';

const CannonConfettiInner = forwardRef<
  CannonConfettiMethods,
  CannonConfettiProps
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
    },
    ref
  ) => {
    const { containerWidth, containerHeight } =
      useContainerDimensions(containerStyle);

    // --- Resolve drag into horizontal / vertical ---
    const hDrag = typeof dragProp === 'number' ? dragProp : dragProp.horizontal;
    const vDrag = typeof dragProp === 'number' ? dragProp : dragProp.vertical;

    // --- Parse children + build atlas via hook ---
    const {
      cannonsPositions,
      cannonConfigs,
      allColors,
      sizeVariations,
      sizeColorOverrides,
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
    });

    // --- Auto-compute duration from physics ---
    const duration = estimateCannonDuration({
      cannonConfigs,
      gravity,
      drag: vDrag,
      sprayDurationMs: sprayDuration,
    });

    // --- Compute launch delay max from sprayDuration ---
    const launchDelayMax =
      sprayDuration !== undefined
        ? Math.min(sprayDuration / duration, 1)
        : DEFAULT_CANNON_CONFETTI_LAUNCH_DELAY_MAX;

    const dynamicCannonsPositions = useSharedValue<Position[] | null>(null);
    const dynamicCannonConfigs = useSharedValue<CannonConfig[] | null>(null);

    const boxes = useSharedValue(
      generateCannonBoxesArray({
        cannonConfigs,
        cannonsPositions,
        containerHeight,
        launchDelayMax,
        sizeColorOverrides,
      })
    );

    const { texture, sprites } = useConfettiLogic({
      sizeVariations,
      colors: allColors,
      boxes,
      sizeColorOverrides,
    });

    const refreshBoxes = useCallback(() => {
      'worklet';
      const currentConfigs = dynamicCannonConfigs.get() || cannonConfigs;
      const currentPositions =
        dynamicCannonsPositions.get() || cannonsPositions;
      const newBoxes = generateCannonBoxesArray({
        cannonConfigs: currentConfigs,
        cannonsPositions: currentPositions,
        containerHeight,
        launchDelayMax,
        sizeColorOverrides,
      });
      boxes.set(newBoxes);
    }, [
      cannonConfigs,
      boxes,
      dynamicCannonConfigs,
      dynamicCannonsPositions,
      cannonsPositions,
      containerHeight,
      launchDelayMax,
      sizeColorOverrides,
    ]);

    const { progress, running, opacity, pause, reset, resume, runAnimation } =
      useAnimationLifecycle({
        duration,
        infinite,
        fadeOutOnEnd,
        onAnimationStart,
        onAnimationEnd,
        onCycleEnd: refreshBoxes,
      });

    const workletRestart = useCallback(
      (
        resolvedPositions: Position[] | null,
        resolvedConfigs: CannonConfig[] | null,
        delay: number = 0
      ) => {
        'worklet';
        dynamicCannonsPositions.set(resolvedPositions);
        dynamicCannonConfigs.set(resolvedConfigs);
        refreshBoxes();
        runAnimation(delay);
      },
      [
        dynamicCannonsPositions,
        dynamicCannonConfigs,
        refreshBoxes,
        runAnimation,
      ]
    );

    const colorCount = allColors.length;
    const sizeCount = sizeVariations.length;

    const jsRestart = useCallback(
      (options: CannonConfettiRestartOptions = {}) => {
        let resolvedPositions: Position[] | null = null;
        let resolvedConfigs: CannonConfig[] | null = null;
        if (options.origins) {
          resolvedPositions = options.origins.map((o) =>
            resolveNamedPosition(o, containerWidth, containerHeight)
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
              speedVariation: { ...DEFAULT_CANNON_CONFETTI_SPEED_VARIATION },
              colorStart: 0,
              colorCount,
              sizeStart: 0,
              sizeCount,
              target,
            };
          });
        }
        runOnUI(workletRestart)(resolvedPositions, resolvedConfigs);
      },
      [
        workletRestart,
        containerWidth,
        containerHeight,
        totalCount,
        colorCount,
        sizeCount,
        rootTarget,
      ]
    );

    useImperativeHandle(ref, () => ({
      pause: runOnUI(pause),
      reset: runOnUI(reset),
      resume: runOnUI(resume),
      restart: jsRestart,
    }));

    useEffect(() => {
      runOnUI(() => {
        if (autoplay && !running.get())
          workletRestart(null, null, autoStartDelay);
      })();
    }, [autoplay, autoStartDelay, workletRestart, running]);

    // Physics constants scaled to container height
    const scaledGravity = gravity * containerHeight;
    // Duration in seconds for physics equations
    const totalTime = duration / 1000;

    const transforms = useRSXformBuffer(totalCount, (val, i) => {
      'worklet';
      const piece = boxes.get()[i];
      if (!piece) {
        val.set(0, 0, -10000, -10000);
        return;
      }

      const currentCannons = dynamicCannonsPositions.get() || cannonsPositions;
      const cannon = currentCannons[piece.cannonIndex % currentCannons.length];
      if (!cannon) {
        val.set(0, 0, -10000, -10000);
        return;
      }
      const cannonX = cannon.x;
      const cannonY = cannon.y;

      const { vx, vy } = piece;

      const p = progress.get();

      const effectiveProgress = interpolate(
        p,
        [piece.launchDelay, 1],
        [0, 1],
        Extrapolation.CLAMP
      );
      const t = effectiveProgress * totalTime;

      const normalizedT = Math.min(t / totalTime, 1);
      const hDecayFactor = 1 - Math.pow(1 - normalizedT, hDrag + 1);
      const vExpDecay = 1 - Math.exp(-vDrag * t);
      const safeVDrag = Math.max(vDrag, 0.001);
      const tx = cannonX + ((vx * totalTime) / (hDrag + 1)) * hDecayFactor;
      const ty =
        cannonY +
        (scaledGravity / safeVDrag) * t +
        ((vy - scaledGravity / safeVDrag) / safeVDrag) * vExpDecay;

      const rotationDirection = piece.clockwise ? 1 : -1;
      const rz =
        piece.initialRotation + p * rotationDirection * piece.maxRotation.z;
      const rx =
        piece.initialRotation + p * rotationDirection * piece.maxRotation.x;

      const minFlipScale = 1 - flipIntensity;
      const oscillatingScale = Math.max(Math.abs(Math.cos(rx)), minFlipScale);
      const appearScale = interpolate(
        effectiveProgress,
        [0, 0.05],
        [initialScale, 1],
        Extrapolation.CLAMP
      );
      const scale = appearScale * oscillatingScale * piece.depthScale;

      const size = sizeVariations[piece.sizeIndex];
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

    return (
      <ConfettiCanvas
        containerStyle={containerStyle}
        texture={texture}
        sprites={sprites}
        transforms={transforms}
        opacity={opacity}
      />
    );
  }
);

CannonConfettiInner.displayName = 'CannonConfetti';

const CannonConfetti = CannonConfettiInner as typeof CannonConfettiInner & {
  Origin: typeof Origin;
  Flake: typeof Flake;
};

CannonConfetti.Origin = Origin;
CannonConfetti.Flake = Flake;

export { CannonConfetti };
