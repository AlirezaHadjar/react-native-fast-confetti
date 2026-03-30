import { useRSXformBuffer } from '@shopify/react-native-skia';
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  forwardRef,
} from 'react';
import {
  Extrapolation,
  interpolate,
  runOnUI,
  useSharedValue,
} from 'react-native-reanimated';
import { generateFallingBoxesArray, estimateFallingDuration } from './utils';
import {
  DEFAULT_BOXES_COUNT,
  DEFAULT_VERTICAL_SPACING,
  DEFAULT_CONFETTI_GRAVITY,
  DEFAULT_CONFETTI_WOBBLE,
  DEFAULT_CONFETTI_DRIFT,
  RANDOM_INITIAL_Y_JIGGLE,
  TRAJECTORY_SAMPLE_COUNT,
} from './constants';
import type {
  ConfettiMethods,
  ConfettiProps,
  InternalConfettiProps,
  FallingBox,
} from './types';
import { useConfettiLogic } from './hooks/useConfettiLogic';
import { useConfettiFlakes } from './hooks/useConfettiFlakes';
import { useContainerDimensions } from './hooks/useContainerDimensions';
import { useAnimationLifecycle } from './hooks/useAnimationLifecycle';
import { ConfettiCanvas } from './ConfettiCanvas';
import { Flake } from './FlakeComponent';

const ConfettiInner = forwardRef<ConfettiMethods, InternalConfettiProps>(
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
    },
    ref
  ) => {
    const { containerWidth, containerHeight } =
      useContainerDimensions(containerStyle);

    // --- Parse children + build atlas via hook ---
    const { allColors, sizeVariations, sizeColorOverrides } =
      useConfettiFlakes({
        children,
        rootColors,
        rootFlakeStyle: flakeStyle,
      });

    // --- Compute grid layout for spawn positions ---
    const maxFlakeWidth = Math.max(...sizeVariations.map((f) => f.width));
    const maxFlakeHeight = Math.max(...sizeVariations.map((f) => f.height));
    const horizontalSpacing = Math.max(
      0,
      containerWidth / count - maxFlakeWidth
    );
    const columnWidth = Math.min(maxFlakeWidth, 20) + horizontalSpacing;
    const rowHeight = Math.min(maxFlakeHeight, 20) + verticalSpacing;
    const columnsNum = Math.floor(containerWidth / columnWidth);
    const rowsNum = Math.ceil(count / columnsNum);
    const baseVerticalOffset = maxFlakeHeight * 0.5;
    const verticalOffset =
      -rowsNum * rowHeight +
      verticalSpacing -
      RANDOM_INITIAL_Y_JIGGLE -
      baseVerticalOffset -
      verticalSpacing / 2;

    // --- Auto-compute duration from physics ---
    const maxWobble = wobble?.max ?? DEFAULT_CONFETTI_WOBBLE.max;
    const duration = estimateFallingDuration({
      gravity,
      containerHeight,
      verticalOffset,
      maxWobble,
    });

    const cycleCount = useSharedValue(0);

    const onCycleEnd = useCallback(() => {
      'worklet';
      cycleCount.set(cycleCount.get() + 1);
    }, [cycleCount]);

    const { progress, running, opacity, pause, reset, resume, runAnimation } =
      useAnimationLifecycle({
        duration,
        infinite,
        fadeOutOnEnd,
        onAnimationStart,
        onAnimationEnd,
        onCycleEnd,
      });

    const totalTime = duration / 1000;

    const boxes = useSharedValue<FallingBox[]>([]);
    const trajectories = useSharedValue<number[]>([]);

    const { texture, sprites } = useConfettiLogic({
      sizeVariations,
      colors: allColors,
      boxes,
      sizeColorOverrides,
    });

    const colorsVariations = allColors.length;
    const sizeVariationsCount = sizeVariations.length;

    const refreshBoxes = useCallback(() => {
      'worklet';
      const result = generateFallingBoxesArray({
        count,
        colorsVariations,
        sizeVariations: sizeVariationsCount,
        sizeColorOverrides,
        containerWidth,
        containerHeight,
        verticalSpacing,
        maxFlakeWidth,
        maxFlakeHeight,
        verticalOffset,
        columnsNum,
        rowsNum,
        rotation,
        depth,
        wobble,
        totalTime,
        gravity,
        infinite,
        continuous,
      });
      boxes.set(result.boxes);
      trajectories.set(result.trajectories);
    }, [
      count,
      colorsVariations,
      sizeVariationsCount,
      sizeColorOverrides,
      boxes,
      trajectories,
      containerWidth,
      containerHeight,
      verticalSpacing,
      maxFlakeWidth,
      maxFlakeHeight,
      verticalOffset,
      columnsNum,
      rowsNum,
      rotation,
      depth,
      wobble,
      totalTime,
      gravity,
      infinite,
      continuous,
    ]);

    const restart = useCallback(
      (delay: number = 0) => {
        'worklet';
        refreshBoxes();
        cycleCount.set(0);
        runAnimation(delay);
      },
      [refreshBoxes, cycleCount, runAnimation]
    );

    useImperativeHandle(ref, () => ({
      pause: runOnUI(pause),
      reset: runOnUI(() => {
        'worklet';
        reset();
        cycleCount.set(0);
      }),
      resume: runOnUI(resume),
      restart: runOnUI(restart),
    }));

    useEffect(() => {
      runOnUI(() => {
        if (autoplay && !running.get()) restart(autoStartDelay);
      })();
    }, [autoplay, autoStartDelay, restart, running]);

    const maxIdx = TRAJECTORY_SAMPLE_COUNT;
    const transforms = useRSXformBuffer(count, (val, i) => {
      'worklet';
      const piece = boxes.get()[i];
      if (!piece) {
        val.set(0, 0, -10000, -10000);
        return;
      }

      const globalP = progress.get();

      let p: number;
      if (continuous) {
        const elapsed = cycleCount.get() + globalP;
        const pieceElapsed = elapsed - piece.phaseOffset;
        p = pieceElapsed <= 0 ? 0 : pieceElapsed % 1.0;
      } else {
        p = globalP;
      }
      const t = p * totalTime;

      // --- Trajectory lookup ---
      const rawIdx = p * maxIdx;
      const s0 = Math.min(Math.floor(rawIdx), maxIdx - 1);
      const u = rawIdx - s0;

      const base = (i * (maxIdx + 1) + s0) * 3;
      const traj = trajectories.get();
      const x0 = traj[base] ?? 0;
      const y0 = traj[base + 1] ?? 0;
      const t0 = traj[base + 2] ?? 0;
      const x1 = traj[base + 3] ?? 0;
      const y1 = traj[base + 4] ?? 0;
      const t1 = traj[base + 5] ?? 0;

      const rawTx = x0 + (x1 - x0) * u;
      const ty = y0 + (y1 - y0) * u;
      const tx = piece.spawnX + (rawTx - piece.spawnX) * drift;
      const tumbleTheta = t0 + (t1 - t0) * u;

      // --- Visual rotation (continuous spin, separate axis) ---
      const clockwiseDir = piece.clockwise ? 1 : -1;
      const rz = piece.spinPhase + clockwiseDir * piece.spinRate * t;

      // --- Scale from tumble ---
      const rawCos = Math.cos(tumbleTheta);
      const minFlipScale = 1 - flipIntensity;
      const absClamped = Math.max(Math.abs(rawCos), minFlipScale);
      const oscillatingScale = piece.isTextured
        ? absClamped
        : (rawCos >= 0 ? 1 : -1) * absClamped;
      const appearScale = continuous
        ? 1
        : interpolate(p, [0, 0.05], [initialScale, 1], Extrapolation.CLAMP);
      const scale = appearScale * oscillatingScale * piece.depthScale;

      // --- RSXform ---
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

ConfettiInner.displayName = 'Confetti';

const Confetti = ConfettiInner as React.ForwardRefExoticComponent<
  ConfettiProps & React.RefAttributes<ConfettiMethods>
> & {
  Flake: typeof Flake;
};

Confetti.Flake = Flake;

/**
 * Legacy export for ContinuousConfetti.
 * ContinuousConfetti will need to be migrated to the new API separately.
 */
const InternalConfetti = ConfettiInner as React.ForwardRefExoticComponent<
  InternalConfettiProps & React.RefAttributes<ConfettiMethods>
>;
InternalConfetti.displayName = 'InternalConfetti';

export { Confetti, InternalConfetti };
