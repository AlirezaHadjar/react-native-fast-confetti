import { useRSXformBuffer, Canvas, Atlas } from '@shopify/react-native-skia';
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  forwardRef,
} from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import {
  cancelAnimation,
  Extrapolation,
  interpolate,
  runOnUI,
  useDerivedValue,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { generateFallingBoxesArray, estimateFallingDuration } from './utils';
import {
  DEFAULT_BOXES_COUNT,
  DEFAULT_VERTICAL_SPACING,
  DEFAULT_CONFETTI_GRAVITY,
  DEFAULT_CONFETTI_FLUTTER,
  DEFAULT_CONFETTI_DRIFT,
  RANDOM_INITIAL_Y_JIGGLE,
  TRAJECTORY_SAMPLE_COUNT,
} from './constants';
import type {
  ConfettiMethods,
  ConfettiProps,
  InternalConfettiProps,
  ConfettiRestartOptions,
  FallingBox,
} from './types';
import { useConfettiLogic } from './hooks/useConfettiLogic';
import { useConfettiFlakes } from './hooks/useConfettiFlakes';
import { useTextureProps } from './hooks/useTextureProps';
import { useAnimationCallbacks } from './hooks/useAnimationCallbacks';
import { Flake } from './FlakeComponent';

const ConfettiInner = forwardRef<ConfettiMethods, InternalConfettiProps>(
  (
    {
      children,
      count = DEFAULT_BOXES_COUNT,
      colors: rootColors,
      gravity = DEFAULT_CONFETTI_GRAVITY,
      flutter,
      drift = DEFAULT_CONFETTI_DRIFT,
      autoplay = true,
      infinite = false,
      continuous = false,
      fadeOutOnEnd = false,
      onAnimationEnd,
      onAnimationStart,
      width: _width,
      height: _height,
      containerStyle,
      rotation,
      depth,
      verticalSpacing = DEFAULT_VERTICAL_SPACING,
      flakeStyle = 'solid',
      initialScale = 0.3,
      tumbleClamp = 0.15,
      ...textureRootProps
    },
    ref
  ) => {
    const { width: DEFAULT_SCREEN_WIDTH, height: DEFAULT_SCREEN_HEIGHT } =
      useWindowDimensions();
    const containerWidth = _width || DEFAULT_SCREEN_WIDTH;
    const containerHeight = _height || DEFAULT_SCREEN_HEIGHT;

    // --- Resolve texture from root props ---
    const { textureProps, hasTexture } = useTextureProps(textureRootProps);

    // --- Parse children + build atlas via hook ---
    const { allColors, sizeVariations } = useConfettiFlakes({
      children,
      rootColors,
      rootFlakeStyle: flakeStyle,
      hasTexture,
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
    const maxFlutter = flutter?.max ?? DEFAULT_CONFETTI_FLUTTER.max;
    const duration = estimateFallingDuration({
      gravity,
      containerHeight,
      verticalOffset,
      maxFlutter,
    });

    const progress = useSharedValue(0);
    const running = useSharedValue(false);
    // Tracks how many full cycles have completed so we can compute
    // monotonic elapsed time: totalElapsed = cycleCount + progress.
    const cycleCount = useSharedValue(0);

    const opacity = useDerivedValue(() => {
      if (!fadeOutOnEnd) return 1;
      return interpolate(progress.get(), [0.8, 1], [1, 0], Extrapolation.CLAMP);
    }, [fadeOutOnEnd]);

    const totalTime = duration / 1000;

    const boxes = useSharedValue<FallingBox[]>([]);
    const trajectories = useSharedValue<number[]>([]);

    const { texture, sprites } = useConfettiLogic({
      sizeVariations,
      colors: allColors,
      boxes,
      textureProps,
    });

    const pause = () => {
      'worklet';
      running.set(false);
      cancelAnimation(progress);
    };

    const reset = () => {
      'worklet';
      pause();
      progress.set(0);
      cycleCount.set(0);
    };

    const refreshBoxes = useCallback(() => {
      'worklet';
      const result = generateFallingBoxesArray({
        count,
        colorsVariations: allColors.length,
        sizeVariations: sizeVariations.length,
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
        flutter,
        totalTime,
        gravity,
        infinite,
        continuous,
      });
      boxes.set(result.boxes);
      trajectories.set(result.trajectories);
    }, [
      count,
      allColors.length,
      sizeVariations.length,
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
      flutter,
      totalTime,
      gravity,
      infinite,
      continuous,
    ]);

    const { UIOnStart, UIOnEnd } = useAnimationCallbacks(
      onAnimationStart,
      onAnimationEnd
    );

    const restart = useCallback(
      (_options: ConfettiRestartOptions = {}) => {
        'worklet';

        refreshBoxes();
        progress.set(0);
        cycleCount.set(0);
        running.set(true);
        UIOnStart();

        function repeatAnimation() {
          'worklet';
          UIOnEnd();
          cycleCount.set(cycleCount.get() + 1);
          if (infinite) {
            cancelAnimation(progress);
            progress.set(0);
            progress.set(
              withTiming(1, { duration, easing: Easing.linear }, (finished) => {
                'worklet';
                if (!finished || !infinite) return;
                repeatAnimation();
              })
            );
          }
        }

        progress.set(
          withTiming(1, { duration, easing: Easing.linear }, (finished) => {
            'worklet';
            if (!finished || !infinite) {
              if (finished) UIOnEnd();
              return;
            }
            repeatAnimation();
          })
        );
      },
      [
        refreshBoxes,
        progress,
        running,
        cycleCount,
        UIOnStart,
        UIOnEnd,
        infinite,
        duration,
      ]
    );

    const resume = () => {
      'worklet';
      if (running.get()) return;
      running.set(true);

      const remaining = duration * (1 - progress.get());

      function repeatAnimation() {
        'worklet';
        UIOnEnd();
        if (infinite) {
          cancelAnimation(progress);
          progress.set(0);
          progress.set(
            withTiming(1, { duration, easing: Easing.linear }, (finished) => {
              'worklet';
              if (!finished || !infinite) return;
              repeatAnimation();
            })
          );
        }
      }

      progress.set(
        withTiming(
          1,
          { duration: remaining, easing: Easing.linear },
          (finished) => {
            'worklet';
            if (!finished || !infinite) {
              if (finished) UIOnEnd();
              return;
            }
            repeatAnimation();
          }
        )
      );
    };

    useImperativeHandle(ref, () => ({
      pause: runOnUI(pause),
      reset: runOnUI(reset),
      resume: runOnUI(resume),
      restart: runOnUI(restart),
    }));

    useEffect(() => {
      runOnUI(() => {
        if (autoplay && !running.get()) restart();
      })();
    }, [autoplay, restart, running]);

    const maxIdx = TRAJECTORY_SAMPLE_COUNT;
    const transforms = useRSXformBuffer(count, (val, i) => {
      'worklet';
      const piece = boxes.get()[i];
      if (!piece) return;

      const globalP = progress.get();

      // In continuous mode, compute each piece's local progress from
      // monotonic elapsed time. Pieces start their trajectory (p=0, at
      // spawn position above viewport) only once elapsed >= phaseOffset.
      let p: number;
      if (continuous) {
        const elapsed = cycleCount.get() + globalP;
        const pieceElapsed = elapsed - piece.phaseOffset;
        // Before this piece's spawn time, pin to p=0 (spawn position,
        // above the viewport). It sits there invisibly until its turn.
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
      const rawTx = traj[base]! + (traj[base + 3]! - traj[base]!) * u;
      const ty = traj[base + 1]! + (traj[base + 4]! - traj[base + 1]!) * u;
      // Blend ODE horizontal position toward spawn column by drift factor
      const tx = piece.spawnX + (rawTx - piece.spawnX) * drift;
      const tumbleTheta =
        traj[base + 2]! + (traj[base + 5]! - traj[base + 2]!) * u;

      // --- Visual rotation (continuous spin, separate axis) ---
      const clockwiseDir = piece.clockwise ? 1 : -1;
      const rz = piece.spinPhase + clockwiseDir * piece.spinRate * t;

      // --- Scale from tumble ---
      // Clamp so edge-on pieces stay visible (uniform scale shrinks both axes)
      const rawCos = Math.cos(tumbleTheta);
      const absClamped = Math.max(Math.abs(rawCos), tumbleClamp);
      // For textured pieces (image/SVG), skip the sign flip to avoid mirroring.
      const oscillatingScale = hasTexture
        ? absClamped
        : (rawCos >= 0 ? 1 : -1) * absClamped;
      // In continuous mode, skip appear scale — pieces start at terminal velocity.
      // In single/infinite mode, scale in over the first 5% of progress.
      const appearScale = continuous
        ? 1
        : interpolate(p, [0, 0.05], [initialScale, 1], Extrapolation.CLAMP);
      const scale = appearScale * oscillatingScale * piece.depthScale;

      // --- RSXform ---
      const size = sizeVariations[piece.sizeIndex]!;
      const px = size.width / 2;
      const py = size.height / 2;
      const s = Math.sin(rz) * scale;
      const c = Math.cos(rz) * scale;
      val.set(c, s, tx - c * px + s * py, ty - s * px - c * py);
    });

    return (
      <View pointerEvents="none" style={[styles.container, containerStyle]}>
        <Canvas style={styles.canvasContainer}>
          <Atlas
            image={texture}
            sprites={sprites}
            transforms={transforms}
            opacity={opacity}
          />
        </Canvas>
      </View>
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

const styles = StyleSheet.create({
  container: {
    height: '100%',
    width: '100%',
    position: 'absolute',
    zIndex: 1,
  },
  canvasContainer: {
    width: '100%',
    height: '100%',
  },
});
