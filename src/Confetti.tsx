import { useRSXformBuffer, Canvas, Atlas } from '@shopify/react-native-skia';
import { useCallback, useEffect, useImperativeHandle, forwardRef } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import {
  cancelAnimation,
  Extrapolation,
  interpolate,
  runOnJS,
  runOnUI,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { generateBoxesArray, generateEvenlyDistributedValues } from './utils';
import {
  DEFAULT_AUTOSTART_DELAY,
  DEFAULT_BOXES_COUNT,
  DEFAULT_COLORS,
  DEFAULT_CONFETTI_FALL_EASING,
  DEFAULT_CONFETTI_RANDOM_OFFSET,
  DEFAULT_FALL_DURATION,
  DEFAULT_FLAKE_SIZE,
  DEFAULT_VERTICAL_SPACING,
  RANDOM_INITIAL_Y_JIGGLE,
} from './constants';
import type {
  ConfettiMethods,
  ConfettiProps,
  InternalConfettiProps,
  ConfettiRestartOptions,
} from './types';
import { useConfettiLogic } from './hooks/useConfettiLogic';
import { useVariations } from './hooks/sizeVariations';

const InternalConfetti = forwardRef<ConfettiMethods, InternalConfettiProps>(
  (
    {
      count = DEFAULT_BOXES_COUNT,
      flakeSize = DEFAULT_FLAKE_SIZE,
      fallDuration = DEFAULT_FALL_DURATION,
      colors = DEFAULT_COLORS,
      autoStartDelay = DEFAULT_AUTOSTART_DELAY,
      verticalSpacing = DEFAULT_VERTICAL_SPACING,
      rotation,
      randomSpeed,
      randomOffset,
      isContinuous,
      onAnimationEnd,
      onAnimationStart,
      width: _width,
      height: _height,
      autoplay = true,
      isInfinite = autoplay,
      fadeOutOnEnd = false,
      fallEasing: _fallEasing,
      easing,
      containerStyle,
      ...flakeProps
    },
    ref
  ) => {
    const _radiusRange =
      'radiusRange' in flakeProps ? flakeProps.radiusRange : undefined;
    const fallEasing =
      _fallEasing ?? easing ?? DEFAULT_CONFETTI_FALL_EASING;
    const initialProgress = 1;
    const endProgress = 2;
    const progress = useSharedValue(initialProgress);
    const opacity = useDerivedValue(() => {
      if (!fadeOutOnEnd) return 1;
      return interpolate(
        progress.get(),
        [1, 1.9, 2],
        [1, 0, 0],
        Extrapolation.CLAMP
      );
    }, [fadeOutOnEnd]);
    const running = useSharedValue(false);
    const { width: DEFAULT_SCREEN_WIDTH, height: DEFAULT_SCREEN_HEIGHT } =
      useWindowDimensions();
    const containerWidth = _width || DEFAULT_SCREEN_WIDTH;
    const containerHeight = _height || DEFAULT_SCREEN_HEIGHT;
    // if the count * maxFlakeWidth is less than to fill the first row, we need to add horizontal spacing
    const maxFlakeWidth = Math.max(...flakeSize.map(f => f.width))
    const maxFlakeHeight = Math.max(...flakeSize.map(f => f.height))
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
      baseVerticalOffset;
    const sizeVariations = useVariations({
      flakeSize,
      _radiusRange,
    });
    const boxes = useSharedValue(
      generateBoxesArray({
        count,
        colorsVariations: colors.length,
        sizeVariations: sizeVariations.length,
        duration: fallDuration,
        rotation,
        randomSpeed,
        randomOffset,
      })
    );
    const delayStartTime = useSharedValue(0);
    const initialVertical =
      randomOffset?.y?.max || DEFAULT_CONFETTI_RANDOM_OFFSET.y?.max || 0;

    const fallingMaxYMovement =
      Math.abs(verticalOffset) +
      containerHeight +
      verticalSpacing +
      Math.abs(initialVertical) +
      Math.min(1 - (randomSpeed?.min || 0), 1) * containerHeight;

    //Calculate the time it takes for a single confetti flake to traverse the visible screen area.
    const singleFlakeFallDuration =
      (containerHeight * fallDuration) / fallingMaxYMovement;
    const continuousDelay =
      isContinuous === 2
        ? (fallDuration - singleFlakeFallDuration) * 0.9
        : 0;
    const delay = autoStartDelay + continuousDelay;

    const { texture, sprites } = useConfettiLogic({
      sizeVariations,
      colors,
      boxes,
      textureProps:
        flakeProps.type === 'image' && flakeProps.flakeImage
          ? { type: 'image', content: flakeProps.flakeImage }
          : flakeProps.type === 'svg' && flakeProps.flakeSvg
            ? { type: 'svg', content: flakeProps.flakeSvg }
            : undefined,
    });

    const pause = () => {
      'worklet';

      running.set(false);
      cancelAnimation(progress);
    };

    const reset = () => {
      'worklet';

      pause();
      progress.set(initialProgress);
    };

    const refreshBoxes = useCallback(() => {
      'worklet';

      const newBoxes = generateBoxesArray({
        count,
        colorsVariations: colors.length,
        sizeVariations: sizeVariations.length,
        duration: fallDuration,
        rotation,
        randomSpeed,
        randomOffset,
      });
      boxes.set(newBoxes);
    }, [
      count,
      colors.length,
      sizeVariations.length,
      boxes,
      fallDuration,
      rotation,
      randomSpeed,
      randomOffset,
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

    const runAnimation = useCallback(
      (
        {
          fallDuration: _fallDuration,
          delay = 0,
        }: {
          fallDuration?: number;
          delay?: number;
        },
        onEnd?: (finished: boolean | undefined) => void
      ) => {
        'worklet';

        const animations: number[] = [];

        if (_fallDuration)
          animations.push(
            withTiming(
              2,
              { duration: _fallDuration, easing: fallEasing },
              (finished) => {
                onEnd?.(finished);
              }
            )
          );

        const finalAnimation =
          delay > 0
            ? withDelay(delay, withSequence(...animations))
            : withSequence(...animations);

        if (delay > 0) {
          delayStartTime.set(Date.now());
        }

        return finalAnimation;
      },
      [delayStartTime, fallEasing]
    );

    const restart = useCallback(
      (_options: ConfettiRestartOptions = {}) => {
        'worklet';

        refreshBoxes();
        progress.set(initialProgress);
        running.set(true);
        if (isContinuous !== 2) UIOnStart();

        function repeatAnimation() {
          'worklet';
          if (!isContinuous) UIOnEnd();
          refreshBoxes();
          if (isInfinite) {
            cancelAnimation(progress);
            progress.set(initialProgress);
            progress.set(
              runAnimation(
                {
                  fallDuration,
                  delay: fallDuration - 2.5 * singleFlakeFallDuration,
                },
                (finished) => {
                  'worklet';
                  if (!finished || !isInfinite) return;
                  repeatAnimation();
                }
              )
            );
          }
        }

        const startAnimation = (delay: number) => {
          'worklet';
          progress.set(
            runAnimation({ fallDuration, delay }, (finished) => {
              'worklet';
              if (!finished || !isInfinite) return;
              repeatAnimation();
            })
          );
        };

        startAnimation(delay);
      },
      [
        refreshBoxes,
        progress,
        running,
        isContinuous,
        UIOnStart,
        delay,
        UIOnEnd,
        isInfinite,
        runAnimation,
        fallDuration,
        singleFlakeFallDuration,
      ]
    );

    const resume = () => {
      'worklet';

      if (running.get()) return;
      running.set(true);

      const fallingRemaining = fallDuration * (2 - progress.get());

      function repeatAnimation() {
        'worklet';
        if (!isContinuous) UIOnEnd();
        refreshBoxes();
        if (isInfinite) {
          cancelAnimation(progress);
          progress.set(initialProgress);
          progress.set(
            runAnimation(
              {
                fallDuration,
                delay: fallDuration - 2.5 * singleFlakeFallDuration,
              },
              (finished) => {
                'worklet';
                if (!finished || !isInfinite) return;
                repeatAnimation();
              }
            )
          );
        }
      }

      let _delay = 0;

      //  we're resuming when the animation is not running and is in the delay phase
      if (isContinuous === 2 && progress.get() === initialProgress) {
        const elapsed = Date.now() - delayStartTime.get();
        const remaining = delay - elapsed;
        _delay = remaining;
      }

      progress.set(
        runAnimation(
          {
            fallDuration: fallingRemaining,
            delay: _delay,
          },
          (finished) => {
            'worklet';
            if (!finished || !isInfinite) return;

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

    const getPosition = (index: number) => {
      'worklet';
      const rowIndex = Math.floor(index / columnsNum);
      const isLastRow = rowIndex === rowsNum - 1;

      let x: number;
      // if the last row is not full, we need to calculate the spacing to spread items evenly
      if (isLastRow) {
        // Calculate remaining items in last row
        const itemsInLastRow = count - (rowsNum - 1) * columnsNum;
        // Calculate spacing to spread items evenly
        const lastRowSpacing =
          (containerWidth - itemsInLastRow * maxFlakeWidth) /
          (itemsInLastRow + 1);
        // Get position within last row (0 to itemsInLastRow-1)
        const positionInLastRow = index - (rowsNum - 1) * columnsNum;
        x =
          lastRowSpacing +
          positionInLastRow * (maxFlakeWidth + lastRowSpacing);
      } else {
        x = (index % columnsNum) * columnWidth;
      }

      let y = rowIndex * rowHeight;

      y -= Math.abs(initialVertical);
      return { x, y };
    };

    useEffect(() => {
      runOnUI(() => {
        if (autoplay && !running.get()) restart();
      })();
    }, [autoplay, restart, running]);

    const transforms = useRSXformBuffer(count, (val, i) => {
      'worklet';
      const piece = boxes.get()[i];
      if (!piece) return;

      const { x, y } = getPosition(i);

      const initialRandomY = piece.initialRandomY;
      let tx = x + piece.randomOffsetX;
      let ty = y + piece.randomOffsetY + initialRandomY + verticalOffset;

      // Apply random speed to the fall height
      const yChange = interpolate(
        progress.get(),
        [1, 2],
        [0, fallingMaxYMovement * piece.randomSpeed],
        Extrapolation.CLAMP
      );
      // Interpolate between randomX values for smooth left-right movement
      const randomX = interpolate(
        progress.get(),
        generateEvenlyDistributedValues(1, 2, piece.randomXs.length),
        piece.randomXs,
        Extrapolation.CLAMP
      );

      tx += randomX;
      ty += yChange;

      const rotationDirection = piece.clockwise ? 1 : -1;
      const rz =
        piece.initialRotation +
        interpolate(
          progress.get(),
          [initialProgress, endProgress],
          [0, rotationDirection * piece.maxRotation.z],
          Extrapolation.CLAMP
        );
      const rx =
        piece.initialRotation +
        interpolate(
          progress.get(),
          [initialProgress, endProgress],
          [0, rotationDirection * piece.maxRotation.x],
          Extrapolation.CLAMP
        );

      const oscillatingScale = Math.abs(Math.cos(rx));
      const scale = oscillatingScale;
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

const Confetti = forwardRef<ConfettiMethods, ConfettiProps>((props, ref) => {
  return <InternalConfetti {...props} ref={ref} />;
});

Confetti.displayName = 'Confetti';
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
