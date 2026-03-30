import { useRSXformBuffer } from '@shopify/react-native-skia';
import { useCallback, useEffect, useImperativeHandle, forwardRef } from 'react';
import {
  Extrapolation,
  interpolate,
  runOnUI,
  useSharedValue,
} from 'react-native-reanimated';
import {
  generatePIBoxesArray,
  resolveNamedPosition,
  estimatePIDuration,
} from './utils';
import {
  DEFAULT_BOXES_COUNT,
  DEFAULT_PI_CONFETTI_GRAVITY,
  DEFAULT_PI_CONFETTI_DRAG,
  DEFAULT_PI_CONFETTI_INITIAL_SPEED,
  DEFAULT_PI_CONFETTI_SPREAD,
  DEFAULT_PI_CONFETTI_LAUNCH_DELAY_MAX,
} from './constants';
import type {
  PIConfettiMethods,
  PIConfettiProps,
  PIConfettiRestartOptions,
  Position,
} from './types';
import { useConfettiLogic } from './hooks/useConfettiLogic';
import { useConfettiFlakes } from './hooks/useConfettiFlakes';
import { useAnimationLifecycle } from './hooks/useAnimationLifecycle';
import { useContainerDimensions } from './hooks/useContainerDimensions';
import { ConfettiCanvas } from './ConfettiCanvas';
import { Flake } from './FlakeComponent';

function resolveBlastPosition(
  blastPosition: PIConfettiProps['blastPosition'],
  containerWidth: number,
  containerHeight: number
): Position {
  if (blastPosition == null) {
    return { x: containerWidth / 2, y: containerHeight / 2 };
  }
  if (typeof blastPosition === 'object') {
    return blastPosition;
  }
  return resolveNamedPosition(blastPosition, containerWidth, containerHeight);
}

const PIConfettiInner = forwardRef<PIConfettiMethods, PIConfettiProps>(
  (
    {
      children,
      count = DEFAULT_BOXES_COUNT,
      colors: rootColors,
      gravity = DEFAULT_PI_CONFETTI_GRAVITY,
      drag: dragProp = DEFAULT_PI_CONFETTI_DRAG,
      initialSpeed = DEFAULT_PI_CONFETTI_INITIAL_SPEED,
      spread = DEFAULT_PI_CONFETTI_SPREAD,
      speedVariation,
      blastPosition: _blastPosition,
      autoplay = true,
      infinite = false,
      fadeOutOnEnd = false,
      autoStartDelay = 0,
      rotation,
      depth,
      flakeStyle = 'glossy',
      initialScale = 0.3,
      flipIntensity = 0.85,
      sprayDuration,
      onAnimationEnd,
      onAnimationStart,
      containerStyle,
    },
    ref
  ) => {
    const { containerWidth, containerHeight } =
      useContainerDimensions(containerStyle);

    // --- Resolve drag into horizontal / vertical ---
    const hDrag = typeof dragProp === 'number' ? dragProp : dragProp.horizontal;
    const vDrag = typeof dragProp === 'number' ? dragProp : dragProp.vertical;

    // --- Parse children for flake sizes ---
    const { allColors, sizeVariations, sizeColorOverrides } = useConfettiFlakes(
      {
        children,
        rootColors,
        rootFlakeStyle: flakeStyle,
      }
    );

    const defaultBlastPosition = resolveBlastPosition(
      _blastPosition,
      containerWidth,
      containerHeight
    );

    // --- Auto-compute duration from physics ---
    const duration = estimatePIDuration({
      initialSpeed,
      gravity,
      vDrag,
      depth,
      speedVariation,
      sprayDurationMs: sprayDuration,
      containerHeight,
      blastY: defaultBlastPosition.y,
    });

    // --- Compute launch delay max from sprayDuration ---
    const launchDelayMax =
      sprayDuration !== undefined
        ? Math.min(sprayDuration / duration, 1)
        : DEFAULT_PI_CONFETTI_LAUNCH_DELAY_MAX;

    const dynamicBlastPosition = useSharedValue<Position | null>(null);

    const colorsVariations = allColors.length;
    const sizeVariationsCount = sizeVariations.length;

    const boxes = useSharedValue(
      generatePIBoxesArray({
        count,
        colorsVariations,
        sizeVariations: sizeVariationsCount,
        sizeColorOverrides,
        spread,
        rotation,
        speedVariation,
        depth,
        launchDelayMax,
      })
    );

    const refreshBoxes = useCallback(() => {
      'worklet';
      const newBoxes = generatePIBoxesArray({
        count,
        colorsVariations,
        sizeVariations: sizeVariationsCount,
        sizeColorOverrides,
        spread,
        rotation,
        speedVariation,
        depth,
        launchDelayMax,
      });
      boxes.set(newBoxes);
    }, [
      count,
      colorsVariations,
      sizeVariationsCount,
      sizeColorOverrides,
      spread,
      rotation,
      speedVariation,
      depth,
      launchDelayMax,
      boxes,
    ]);

    const { progress, running, opacity, pause, reset, resume, runAnimation } =
      useAnimationLifecycle({
        duration,
        infinite,
        fadeOutOnEnd,
        onAnimationStart,
        onAnimationEnd,
        fadeRange: [0.5, 0.9],
        onCycleEnd: refreshBoxes,
      });

    const { texture, sprites } = useConfettiLogic({
      sizeVariations,
      colors: allColors,
      boxes,
      sizeColorOverrides,
    });

    const workletRestart = useCallback(
      (resolvedPosition: Position | null, delay: number = 0) => {
        'worklet';
        dynamicBlastPosition.set(resolvedPosition);
        refreshBoxes();
        runAnimation(delay);
      },
      [dynamicBlastPosition, refreshBoxes, runAnimation]
    );

    const jsRestart = useCallback(
      (options: PIConfettiRestartOptions = {}) => {
        let resolvedPosition: Position | null = null;
        if (options.blastPosition != null) {
          resolvedPosition =
            typeof options.blastPosition === 'object'
              ? options.blastPosition
              : resolveNamedPosition(
                  options.blastPosition,
                  containerWidth,
                  containerHeight
                );
        }
        runOnUI(workletRestart)(resolvedPosition);
      },
      [workletRestart, containerWidth, containerHeight]
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
          workletRestart(null, autoStartDelay);
      })();
    }, [autoplay, autoStartDelay, workletRestart, running]);

    // Physics constants scaled to container height
    const scaledGravity = gravity * containerHeight;
    // Duration in seconds for physics equations
    const totalTime = duration / 1000;

    const transforms = useRSXformBuffer(count, (val, i) => {
      'worklet';
      const piece = boxes.get()[i];
      if (!piece || !running.get()) {
        val.set(0, 0, -10000, -10000);
        return;
      }

      const currentBlastPosition =
        dynamicBlastPosition.get() || defaultBlastPosition;
      const blastX = currentBlastPosition.x;
      const blastY = currentBlastPosition.y;

      const speed =
        initialSpeed *
        containerHeight *
        piece.speedMultiplier *
        piece.depthScale;
      const vx = speed * Math.cos(piece.angle);
      const vy = speed * Math.sin(piece.angle);

      const p = progress.get();

      // Current time based on progress, accounting for launch delay
      const effectiveProgress = interpolate(
        p,
        [piece.launchDelay, 1],
        [0, 1],
        Extrapolation.CLAMP
      );
      const t = effectiveProgress * totalTime;

      // Physics: separate drag for horizontal and vertical axes
      const safeHDrag = Math.max(hDrag, 0.001);
      const safeVDrag = Math.max(vDrag, 0.001);
      const hExpDecay = 1 - Math.exp(-safeHDrag * t);
      const vExpDecay = 1 - Math.exp(-safeVDrag * t);
      const tx = blastX + (vx / safeHDrag) * hExpDecay;
      const ty =
        blastY +
        (scaledGravity / safeVDrag) * t +
        ((vy - scaledGravity / safeVDrag) / safeVDrag) * vExpDecay;

      // Rotation
      const rotationDirection = piece.clockwise ? 1 : -1;
      const rz =
        piece.initialRotation +
        interpolate(
          p,
          [0, 1],
          [0, rotationDirection * piece.maxRotation.z],
          Extrapolation.CLAMP
        );
      const rx =
        piece.initialRotation +
        interpolate(
          p,
          [0, 1],
          [0, rotationDirection * piece.maxRotation.x],
          Extrapolation.CLAMP
        );

      // Scale: appearance animation at launch + oscillation
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

PIConfettiInner.displayName = 'PIConfetti';

const PIConfetti = PIConfettiInner as typeof PIConfettiInner & {
  Flake: typeof Flake;
};

PIConfetti.Flake = Flake;

export { PIConfetti };
