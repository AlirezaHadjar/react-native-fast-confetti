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
import {
  generateFallingBoxesArray,
  estimateFallingDuration,
} from './utils';
import {
  DEFAULT_BOXES_COUNT,
  DEFAULT_VERTICAL_SPACING,
  DEFAULT_CONFETTI_GRAVITY,
  CONFETTI_INTERNAL_DRAG,
  DEFAULT_CONFETTI_FLUTTER,
  RANDOM_INITIAL_Y_JIGGLE,
} from './constants';
import type {
  ConfettiMethods,
  ConfettiProps,
  InternalConfettiProps,
  ConfettiRestartOptions,
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
      return interpolate(
        progress.get(),
        [0.8, 1],
        [1, 0],
        Extrapolation.CLAMP
      );
    }, [fadeOutOnEnd]);

    // Physics constants scaled to container height
    const scaledGravity = gravity * containerHeight;
    const totalTime = duration / 1000;

    const boxes = useSharedValue(
      generateFallingBoxesArray({
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
      })
    );

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
      const newBoxes = generateFallingBoxesArray({
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
      });
      boxes.set(newBoxes);
    }, [
      count,
      allColors.length,
      sizeVariations.length,
      boxes,
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
          refreshBoxes();
          if (infinite) {
            cancelAnimation(progress);
            progress.set(0);
            progress.set(
              withTiming(
                1,
                { duration, easing: Easing.linear },
                (finished) => {
                  'worklet';
                  if (!finished || !infinite) return;
                  repeatAnimation();
                }
              )
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
        refreshBoxes();
        if (infinite) {
          cancelAnimation(progress);
          progress.set(0);
          progress.set(
            withTiming(
              1,
              { duration, easing: Easing.linear },
              (finished) => {
                'worklet';
                if (!finished || !infinite) return;
                repeatAnimation();
              }
            )
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

    const transforms = useRSXformBuffer(count, (val, i) => {
      'worklet';
      const piece = boxes.get()[i];
      if (!piece) return;

      const t = progress.get() * totalTime;
      const theta = piece.tumbleRate * t + piece.tumblePhase;

      // Base fall: gravity + internal drag (depth-coupled for parallax)
      const effectiveGravity = scaledGravity * piece.depthScale;
      const expDecay = 1 - Math.exp(-CONFETTI_INTERNAL_DRAG * t);
      const baseY =
        (effectiveGravity / CONFETTI_INTERNAL_DRAG) * t +
        ((piece.initialVy - effectiveGravity / CONFETTI_INTERNAL_DRAG) /
          CONFETTI_INTERNAL_DRAG) *
          expDecay;

      // Coupled motion from tumble
      const ty =
        piece.spawnY + baseY - piece.flutterAmplitude * Math.sin(2 * theta);
      const tx =
        piece.spawnX + piece.lateralDrift * t - piece.driftAmplitude * Math.cos(2 * theta);

      // Rotation: banking into drift direction + slow background spin
      const clockwiseDir = piece.clockwise ? 1 : -1;
      const rz =
        piece.spinPhase +
        clockwiseDir * piece.spinRate * t +
        piece.bankAmplitude * Math.sin(2 * theta);

      // Scale from tumble (narrowing when edge-on)
      const oscillatingScale = Math.cos(theta);
      const appearScale = interpolate(
        progress.get(),
        [0, 0.05],
        [initialScale, 1],
        Extrapolation.CLAMP
      );
      const scale = appearScale * oscillatingScale * piece.depthScale;

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
