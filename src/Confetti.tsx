import {
  useTexture,
  Group,
  Rect,
  rect,
  useRSXformBuffer,
  Canvas,
  Atlas,
} from '@shopify/react-native-skia';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useState,
} from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import {
  cancelAnimation,
  Extrapolation,
  interpolate,
  runOnJS,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { generateBoxesArray } from './utils';
import {
  DEFAULT_AUTOSTART_DELAY,
  DEFAULT_BLAST_DURATION,
  DEFAULT_BOXES_COUNT,
  DEFAULT_COLORS,
  DEFAULT_FALL_DURATION,
  DEFAULT_FLAKE_SIZE,
  DEFAULT_VERTICAL_SPACING,
  RANDOM_INITIAL_Y_JIGGLE,
} from './constants';
import type { ConfettiMethods, ConfettiProps } from './types';

export const Confetti = forwardRef<ConfettiMethods, ConfettiProps>(
  (
    {
      count = DEFAULT_BOXES_COUNT,
      flakeSize = DEFAULT_FLAKE_SIZE,
      fallDuration = DEFAULT_FALL_DURATION,
      blastDuration = DEFAULT_BLAST_DURATION,
      colors = DEFAULT_COLORS,
      autoStartDelay = DEFAULT_AUTOSTART_DELAY,
      verticalSpacing = DEFAULT_VERTICAL_SPACING,
      onAnimationEnd,
      onAnimationStart,
      width: _width,
      height: _height,
      autoplay = true,
      isInfinite = autoplay,
      fadeOutOnEnd = false,
      cannonsPositions = [],
    },
    ref
  ) => {
    const hasCannons = cannonsPositions.length > 0;
    const initialProgress = hasCannons ? 0 : 1;
    const endProgress = 2;
    const aHasCannon = useDerivedValue(() => hasCannons, [hasCannons]);
    const aInitialProgress = useDerivedValue(
      () => initialProgress,
      [initialProgress]
    );
    const aEndProgress = useDerivedValue(() => endProgress, [endProgress]);
    const progress = useSharedValue(initialProgress);
    const opacity = useDerivedValue(() => {
      if (!fadeOutOnEnd) return 1;
      return interpolate(
        progress.value,
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
    const columnsNum = Math.floor(containerWidth / flakeSize.width);
    const rowsNum = Math.ceil(count / columnsNum);
    const rowHeight = flakeSize.height + verticalSpacing;
    const columnWidth = flakeSize.width;
    const verticalOffset =
      -rowsNum * rowHeight * (hasCannons ? 0.2 : 1) +
      verticalSpacing -
      RANDOM_INITIAL_Y_JIGGLE;
    const textureSize = {
      width: columnWidth * columnsNum,
      height: rowHeight * rowsNum,
    };
    const [boxes, setBoxes] = useState(() => generateBoxesArray(count, colors));

    const pause = () => {
      running.value = false;
      cancelAnimation(progress);
    };

    const reset = () => {
      pause();
      progress.value = initialProgress;
    };

    const refreshBoxes = useCallback(() => {
      'worklet';

      const newBoxes = generateBoxesArray(count, colors);
      runOnJS(setBoxes)(newBoxes);
    }, [count, colors]);

    const JSOnStart = () => onAnimationStart?.();
    const JSOnEnd = () => onAnimationEnd?.();

    const UIOnEnd = () => {
      'worklet';
      runOnJS(JSOnEnd)();
    };

    const runAnimation = (
      {
        blastDuration: _blastDuration,
        fallDuration: _fallDuration,
        infinite,
      }: {
        blastDuration?: number;
        fallDuration?: number;
        infinite: boolean;
      },
      onEnd?: (finished: boolean | undefined) => void
    ) => {
      'worklet';

      const animations: number[] = [];

      if (_blastDuration && aHasCannon.value)
        animations.push(
          withTiming(1, { duration: _blastDuration }, (finished) => {
            if (!_fallDuration) onEnd?.(finished);
          })
        );
      if (_fallDuration)
        animations.push(
          withTiming(2, { duration: _fallDuration }, (finished) => {
            onEnd?.(finished);
          })
        );

      const finalAnimation = withSequence(...animations);

      if (infinite) return withRepeat(finalAnimation, -1, false);

      return finalAnimation;
    };

    const restart = () => {
      refreshBoxes();
      progress.value = initialProgress;
      running.value = true;
      JSOnStart();

      progress.value = runAnimation(
        { infinite: isInfinite, blastDuration, fallDuration },
        (finished) => {
          'worklet';
          if (!finished) return;
          UIOnEnd();
          refreshBoxes();
        }
      );
    };

    const resume = () => {
      if (running.value) return;
      running.value = true;

      const isBlasting = progress.value < 1;
      const blastRemaining = blastDuration * (1 - progress.value);
      const fallingRemaining = fallDuration * (2 - progress.value);

      progress.value = runAnimation(
        {
          blastDuration: isBlasting ? blastRemaining : undefined,
          fallDuration: isBlasting ? fallDuration : fallingRemaining,
          infinite: isInfinite,
        },
        (finished) => {
          'worklet';
          if (!finished) return;
          progress.value = aInitialProgress.value;
          UIOnEnd();
          refreshBoxes();

          if (autoplay)
            progress.value = runAnimation(
              { infinite: isInfinite, blastDuration, fallDuration },
              (_finished) => {
                'worklet';
                if (!_finished) return;
                UIOnEnd();
                refreshBoxes();
              }
            );
        }
      );
    };

    useImperativeHandle(ref, () => ({
      pause,
      reset,
      resume,
      restart,
    }));

    const getPosition = (index: number) => {
      'worklet';
      const x = (index % columnsNum) * flakeSize.width;
      const y = Math.floor(index / columnsNum) * rowHeight;

      return { x, y };
    };

    useEffect(() => {
      if (autoplay && !running.value) setTimeout(restart, autoStartDelay);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoplay]);

    const texture = useTexture(
      <Group>
        {boxes.map((box, index) => {
          const { x, y } = getPosition(index);

          return (
            <Rect
              key={index}
              rect={rect(x, y, flakeSize.width, flakeSize.height)}
              color={box.color}
            />
          );
        })}
      </Group>,
      textureSize
    );

    const sprites = boxes.map((_, index) => {
      const { x, y } = getPosition(index);
      return rect(x, y, flakeSize.width, flakeSize.height);
    });

    const transforms = useRSXformBuffer(count, (val, i) => {
      'worklet';
      const piece = boxes[i];
      if (!piece) return;

      let tx = 0,
        ty = 0;
      const { x, y } = getPosition(i); // Already includes random offsets

      if (progress.value < 1 && aHasCannon.value) {
        // Determine the corresponding index in initialBlasts based on i and count
        const blastIndex = Math.floor((i / count) * cannonsPositions.length);
        const blastPosX = cannonsPositions[blastIndex]?.x || 0;
        const blastPosY = cannonsPositions[blastIndex]?.y || 0;

        const initialRandomX = piece.randomXs[0] || 0;
        const initialRandomY = piece.initialRandomY;
        const initialX = x + piece.randomOffsetX + initialRandomX;
        const initialY =
          y + piece.randomOffsetY + initialRandomY + verticalOffset;

        tx = interpolate(
          progress.value,
          [0, 1],
          [blastPosX, initialX],
          Extrapolation.CLAMP
        );
        ty = interpolate(
          progress.value,
          [0, 1],
          [blastPosY, initialY],
          Extrapolation.CLAMP
        );
      } else {
        const initialRandomY = piece.initialRandomY;
        tx = x + piece.randomOffsetX;
        ty = y + piece.randomOffsetY + initialRandomY + verticalOffset;
        const maxYMovement = -verticalOffset + containerHeight * 1.5; // Add extra to compensate for different speeds

        // Apply random speed to the fall height
        const yChange = interpolate(
          progress.value,
          [1, 2],
          [0, maxYMovement * piece.randomSpeed], // Use random speed here
          Extrapolation.CLAMP
        );
        // Interpolate between randomX values for smooth left-right movement
        const randomX = interpolate(
          progress.value,
          [1, 1.25, 1.5, 1.75, 2],
          piece.randomXs, // Use the randomX array for horizontal movement
          Extrapolation.CLAMP
        );

        tx += randomX;
        ty += yChange;
      }

      const rotationDirection = piece.clockwise ? 1 : -1;
      const rz =
        piece.initialRotation +
        interpolate(
          progress.value,
          [aInitialProgress.value, aEndProgress.value],
          [0, rotationDirection * piece.maxRotation.z],
          Extrapolation.CLAMP
        );
      const rx =
        piece.initialRotation +
        interpolate(
          progress.value,
          [aInitialProgress.value, aEndProgress.value],
          [0, rotationDirection * piece.maxRotation.x],
          Extrapolation.CLAMP
        );

      const oscillatingScale = Math.abs(Math.cos(rx)); // Scale goes from 1 -> 0 -> 1
      const blastScale = interpolate(
        progress.value,
        [0, 0.2, 1],
        [0, 1, 1],
        Extrapolation.CLAMP
      );
      const scale = blastScale * oscillatingScale;

      const px = flakeSize.width / 2;
      const py = flakeSize.height / 2;

      // Apply the transformation, including the flipping effect and randomX oscillation
      const s = Math.sin(rz) * scale;
      const c = Math.cos(rz) * scale;

      // Use the interpolated randomX for horizontal oscillation
      val.set(c, s, tx - c * px + s * py, ty - s * px - c * py);
    });

    return (
      <View pointerEvents="none" style={styles.container}>
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
