import { useRSXformBuffer, Canvas, Atlas } from '@shopify/react-native-skia';
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  forwardRef,
  useMemo,
} from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import {
  cancelAnimation,
  Extrapolation,
  interpolate,
  runOnJS,
  runOnUI,
  useDerivedValue,
  useSharedValue,
  withTiming,
  withDelay,
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
      phaseOffset = 0,
      ...textureRootProps
    },
    ref
  ) => {
    const { width: DEFAULT_SCREEN_WIDTH, height: DEFAULT_SCREEN_HEIGHT } =
      useWindowDimensions();
    const containerWidth = _width || DEFAULT_SCREEN_WIDTH;
    const containerHeight = _height || DEFAULT_SCREEN_HEIGHT;

    // --- Resolve texture from root props ---
    const rootImage =
      'image' in textureRootProps ? textureRootProps.image : undefined;
    const rootSvg =
      'svg' in textureRootProps ? textureRootProps.svg : undefined;
    const textureProps = useMemo(() => {
      if (rootImage) {
        return { type: 'image' as const, content: rootImage };
      }
      if (rootSvg) {
        return { type: 'svg' as const, content: rootSvg };
      }
      return undefined;
    }, [rootImage, rootSvg]);

    const hasTexture = textureProps !== undefined;

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
    ]);

    const JSOnStart = useCallback(
      () => onAnimationStart?.(),
      [onAnimationStart]
    );
    const JSOnEnd = useCallback(() => onAnimationEnd?.(), [onAnimationEnd]);

    const UIOnStart = useCallback(() => {
      'worklet';
      runOnJS(JSOnStart)();
    }, [JSOnStart]);

    const UIOnEnd = useCallback(() => {
      'worklet';
      runOnJS(JSOnEnd)();
    }, [JSOnEnd]);

    const restart = useCallback(
      (_options: ConfettiRestartOptions = {}) => {
        'worklet';

        refreshBoxes();
        progress.set(0);
        running.set(true);
        UIOnStart();

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

        const initialAnimation = withTiming(
          1,
          { duration, easing: Easing.linear },
          (finished) => {
            'worklet';
            if (!finished || !infinite) {
              if (finished) UIOnEnd();
              return;
            }
            repeatAnimation();
          }
        );
        const startDelay = Math.round(phaseOffset * duration);
        progress.set(
          startDelay > 0
            ? withDelay(startDelay, initialAnimation)
            : initialAnimation
        );
      },
      [
        refreshBoxes,
        progress,
        running,
        UIOnStart,
        UIOnEnd,
        infinite,
        duration,
        phaseOffset,
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

      const p = progress.get();
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
      const absClamped = Math.max(Math.abs(rawCos), 0.9);
      // For textured pieces (image/SVG), skip the sign flip to avoid mirroring.
      const oscillatingScale = hasTexture
        ? absClamped
        : (rawCos >= 0 ? 1 : -1) * absClamped;
      const appearScale = interpolate(
        p,
        [0, 0.05],
        [initialScale, 1],
        Extrapolation.CLAMP
      );
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
