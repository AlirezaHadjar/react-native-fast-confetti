import {
  useTexture,
  Group,
  rect,
  useRSXformBuffer,
  Canvas,
  Atlas,
  RoundedRect,
} from '@shopify/react-native-skia';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
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
import {
  generateBoxesArray,
  generateEvenlyDistributedValues,
  getRandomValue,
} from './utils';
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
      sizeVariation = 0,
      fallDuration = DEFAULT_FALL_DURATION,
      blastDuration = DEFAULT_BLAST_DURATION,
      colors = DEFAULT_COLORS,
      autoStartDelay = DEFAULT_AUTOSTART_DELAY,
      verticalSpacing = DEFAULT_VERTICAL_SPACING,
      radiusRange: _radiusRange,
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
    // if the count * flakeSize.width is less than to fill the first row, we need to add horizontal spacing
    const horizontalSpacing = Math.max(
      0,
      containerWidth / count - flakeSize.width
    );
    const columnWidth = flakeSize.width + horizontalSpacing;
    const rowHeight = flakeSize.height + verticalSpacing;
    const columnsNum = Math.floor(containerWidth / columnWidth);
    const rowsNum = Math.ceil(count / columnsNum);
    const verticalOffset =
      -rowsNum * rowHeight * (hasCannons ? 0.2 : 1) +
      verticalSpacing -
      RANDOM_INITIAL_Y_JIGGLE;
    const DEFAULT_RADIUS_RANGE: ConfettiProps['radiusRange'] = [
      0,
      Math.max(flakeSize.width, flakeSize.height) / 2,
    ];
    const radiusRange = _radiusRange || DEFAULT_RADIUS_RANGE;

    const sizeSteps = 10;
    const sizeVariations = useMemo(() => {
      const sizeVariations = [];
      // Nested loops to create all possible width-height combinations
      for (let i = 0; i < sizeSteps; i++) {
        for (let j = 0; j < sizeSteps; j++) {
          // Using quadratic curve to skew distribution towards larger sizes
          // Math.pow(x, 2) creates a curve that produces more values closer to 0
          const widthScale = -Math.pow(i / (sizeSteps - 1), 2);
          const heightScale = -Math.pow(j / (sizeSteps - 1), 2);
          const widthMultiplier = 1 + sizeVariation * widthScale;
          const heightMultiplier = 1 + sizeVariation * heightScale;

          sizeVariations.push({
            width: flakeSize.width * widthMultiplier,
            height: flakeSize.height * heightMultiplier,
            radius: getRandomValue(radiusRange[0], radiusRange[1]),
          });
        }
      }
      return sizeVariations;
    }, [sizeSteps, sizeVariation, flakeSize, radiusRange]);

    const [boxes, setBoxes] = useState(() =>
      generateBoxesArray(count, colors.length, sizeVariations.length)
    );

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

      const newBoxes = generateBoxesArray(
        count,
        colors.length,
        sizeVariations.length
      );
      runOnJS(setBoxes)(newBoxes);
    }, [count, colors, sizeVariations.length]);

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
      const rowIndex = Math.floor(index / columnsNum);
      const isLastRow = rowIndex === rowsNum - 1;

      let x: number;
      // if the last row is not full, we need to calculate the spacing to spread items evenly
      if (isLastRow) {
        // Calculate remaining items in last row
        const itemsInLastRow = count - (rowsNum - 1) * columnsNum;
        // Calculate spacing to spread items evenly
        const lastRowSpacing =
          (containerWidth - itemsInLastRow * flakeSize.width) /
          (itemsInLastRow + 1);
        // Get position within last row (0 to itemsInLastRow-1)
        const positionInLastRow = index - (rowsNum - 1) * columnsNum;
        x =
          lastRowSpacing +
          positionInLastRow * (flakeSize.width + lastRowSpacing);
      } else {
        x = (index % columnsNum) * columnWidth;
      }

      const y = rowIndex * rowHeight;
      return { x, y };
    };

    useEffect(() => {
      if (autoplay && !running.value) setTimeout(restart, autoStartDelay);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoplay]);

    const maxWidth = Math.max(...sizeVariations.map((size) => size.width));
    const maxHeight = Math.max(...sizeVariations.map((size) => size.height));

    const texture = useTexture(
      <Group>
        {colors.map((color, colorIndex) => {
          return sizeVariations.map((size, sizeIndex) => {
            return (
              <RoundedRect
                key={`${colorIndex}-${sizeIndex}`}
                x={sizeIndex * maxWidth}
                y={colorIndex * maxHeight}
                width={size.width}
                height={size.height}
                r={size.radius}
                color={color}
              />
            );
          });
        })}
      </Group>,
      {
        width: maxWidth * sizeVariations.length,
        height: maxHeight * colors.length,
      }
    );

    const sprites = boxes.map((box) => {
      const colorIndex = box.colorIndex;
      const sizeIndex = box.sizeIndex;
      const size = sizeVariations[sizeIndex]!;
      return rect(
        sizeIndex * maxWidth,
        colorIndex * maxHeight,
        size.width,
        size.height
      );
    });

    const transforms = useRSXformBuffer(boxes.length, (val, i) => {
      'worklet';
      const piece = boxes[i];
      if (!piece) return;

      let tx = 0,
        ty = 0;
      const { x, y } = getPosition(i); // Already includes random offsets

      if (progress.value < 1 && aHasCannon.value) {
        // Distribute confetti evenly across cannons by using modulo
        const blastIndex = i % cannonsPositions.length;
        const blastPosX = cannonsPositions[blastIndex]?.x || 0;
        const blastPosY = cannonsPositions[blastIndex]?.y || 0;

        const initialRandomX = piece.randomXs[0] || 0;
        const initialRandomY = piece.initialRandomY;
        const initialX = x + piece.randomOffsetX + initialRandomX;
        const initialY =
          y + piece.randomOffsetY + initialRandomY + verticalOffset;

        tx = interpolate(
          progress.value,
          [piece.blastThreshold, 1],
          [blastPosX, initialX],
          Extrapolation.CLAMP
        );
        ty = interpolate(
          progress.value,
          [piece.blastThreshold, 1],
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
          generateEvenlyDistributedValues(1, 2, piece.randomXs.length),
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
      const size = sizeVariations[piece.sizeIndex]!;

      const px = size.width / 2;
      const py = size.height / 2;

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
