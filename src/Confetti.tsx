import { useRSXformBuffer, Canvas, Atlas } from '@shopify/react-native-skia';
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  type FC,
  type RefObject,
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
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { generateBoxesArray, generateEvenlyDistributedValues } from './utils';
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
import { useConfettiLogic } from './hooks/useConfettiLogic';
import { useVariations } from './hooks/sizeVariations';
import {
  clearAnimatedTimeout,
  setAnimatedTimeout,
  type AnimatedTimeoutID,
} from './hooks/useAnimatedTimeout';

type Props = ConfettiProps & {
  ref: RefObject<ConfettiMethods | null>;
};

const Confetti: FC<Props> = ({
  count = DEFAULT_BOXES_COUNT,
  flakeSize = DEFAULT_FLAKE_SIZE,
  sizeVariation = 0,
  fallDuration = DEFAULT_FALL_DURATION,
  blastDuration = DEFAULT_BLAST_DURATION,
  colors = DEFAULT_COLORS,
  autoStartDelay = DEFAULT_AUTOSTART_DELAY,
  verticalSpacing = DEFAULT_VERTICAL_SPACING,
  rotation,
  onAnimationEnd,
  onAnimationStart,
  width: _width,
  height: _height,
  autoplay = true,
  isInfinite = autoplay,
  fadeOutOnEnd = false,
  cannonsPositions = [],
  ref,
  ...flakeProps
}) => {
  const _radiusRange =
    'radiusRange' in flakeProps ? flakeProps.radiusRange : undefined;
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
  // if the count * flakeSize.width is less than to fill the first row, we need to add horizontal spacing
  const horizontalSpacing = Math.max(
    0,
    containerWidth / count - flakeSize.width
  );
  const columnWidth = Math.min(flakeSize.width, 20) + horizontalSpacing;
  const rowHeight = Math.min(flakeSize.height, 20) + verticalSpacing;
  const columnsNum = Math.floor(containerWidth / columnWidth);
  const rowsNum = Math.ceil(count / columnsNum);
  const baseVerticalOffset = flakeSize.height * 0.5;
  const verticalOffset =
    -rowsNum * rowHeight * (hasCannons ? 0.2 : 1) +
    verticalSpacing -
    RANDOM_INITIAL_Y_JIGGLE -
    baseVerticalOffset;
  const sizeVariations = useVariations({
    sizeVariation,
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
    })
  );
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
    running.set(false);
    cancelAnimation(progress);
  };

  const reset = () => {
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
    });
    boxes.set(newBoxes);
  }, [
    count,
    colors.length,
    sizeVariations.length,
    boxes,
    fallDuration,
    rotation,
  ]);

  const JSOnStart = useCallback(() => onAnimationStart?.(), [onAnimationStart]);
  const JSOnEnd = useCallback(() => onAnimationEnd?.(), [onAnimationEnd]);

  const UIOnEnd = useCallback(() => {
    'worklet';
    runOnJS(JSOnEnd)();
  }, [JSOnEnd]);

  const runAnimation = useCallback(
    (
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

      if (_blastDuration && aHasCannon.get())
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
    },
    [aHasCannon]
  );

  const restart = useCallback(() => {
    'worklet';
    refreshBoxes();
    progress.set(initialProgress);
    running.set(true);
    runOnJS(JSOnStart)();

    progress.set(
      runAnimation(
        { infinite: isInfinite, blastDuration, fallDuration },
        (finished) => {
          'worklet';
          if (!finished) return;
          UIOnEnd();
          refreshBoxes();
        }
      )
    );
  }, [
    JSOnStart,
    UIOnEnd,
    blastDuration,
    fallDuration,
    initialProgress,
    isInfinite,
    progress,
    refreshBoxes,
    runAnimation,
    running,
  ]);

  const resume = () => {
    if (running.get()) return;
    running.set(true);

    const isBlasting = progress.get() < 1;
    const blastRemaining = blastDuration * (1 - progress.get());
    const fallingRemaining = fallDuration * (2 - progress.get());

    progress.set(
      runAnimation(
        {
          blastDuration: isBlasting ? blastRemaining : undefined,
          fallDuration: isBlasting ? fallDuration : fallingRemaining,
          infinite: isInfinite,
        },
        (finished) => {
          'worklet';
          if (!finished) return;
          progress.set(aInitialProgress.get());
          UIOnEnd();
          refreshBoxes();

          if (autoplay)
            progress.set(
              runAnimation(
                { infinite: isInfinite, blastDuration, fallDuration },
                (_finished) => {
                  'worklet';
                  if (!_finished) return;
                  UIOnEnd();
                  refreshBoxes();
                }
              )
            );
        }
      )
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
        lastRowSpacing + positionInLastRow * (flakeSize.width + lastRowSpacing);
    } else {
      x = (index % columnsNum) * columnWidth;
    }

    const y = rowIndex * rowHeight;
    return { x, y };
  };

  const animatedTimeout = useSharedValue<AnimatedTimeoutID>(-1);
  useEffect(() => {
    runOnUI(() => {
      if (autoplay && !running.get()) {
        if (autoStartDelay > 0)
          animatedTimeout.set(setAnimatedTimeout(restart, autoStartDelay));
        else restart();
      }
    })();

    return () => {
      if (animatedTimeout.get() !== -1) {
        clearAnimatedTimeout(animatedTimeout.get());
        animatedTimeout.set(-1);
      }
    };
  }, [animatedTimeout, autoStartDelay, autoplay, restart, running]);

  const transforms = useRSXformBuffer(count, (val, i) => {
    'worklet';
    const piece = boxes.get()[i];
    if (!piece) return;

    let tx = 0,
      ty = 0;
    const { x, y } = getPosition(i); // Already includes random offsets

    if (progress.get() < 1 && aHasCannon.get()) {
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
        progress.get(),
        [piece.blastThreshold, 1],
        [blastPosX, initialX],
        Extrapolation.CLAMP
      );
      ty = interpolate(
        progress.get(),
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
        progress.get(),
        [1, 2],
        [0, maxYMovement * piece.randomSpeed], // Use random speed here
        Extrapolation.CLAMP
      );
      // Interpolate between randomX values for smooth left-right movement
      const randomX = interpolate(
        progress.get(),
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
        progress.get(),
        [aInitialProgress.get(), aEndProgress.get()],
        [0, rotationDirection * piece.maxRotation.z],
        Extrapolation.CLAMP
      );
    const rx =
      piece.initialRotation +
      interpolate(
        progress.get(),
        [aInitialProgress.get(), aEndProgress.get()],
        [0, rotationDirection * piece.maxRotation.x],
        Extrapolation.CLAMP
      );

    const oscillatingScale = Math.abs(Math.cos(rx)); // Scale goes from 1 -> 0 -> 1
    const blastScale = interpolate(
      progress.get(),
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
};

Confetti.displayName = 'Confetti';
export { Confetti };

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
