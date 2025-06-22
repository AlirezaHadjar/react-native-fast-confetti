import { useRSXformBuffer, Canvas, Atlas } from '@shopify/react-native-skia';
import { useImperativeHandle, type FC, type RefObject } from 'react';
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
} from 'react-native-reanimated';
import { generatePIBoxesArray } from './utils';
import {
  DEFAULT_BLAST_DURATION,
  DEFAULT_BLAST_RADIUS,
  DEFAULT_BOXES_COUNT,
  DEFAULT_COLORS,
  DEFAULT_FALL_DURATION,
  DEFAULT_FLAKE_SIZE,
} from './constants';
import type { ConfettiMethods, PIConfettiProps } from './types';
import { useConfettiLogic } from './hooks/useConfettiLogic';
import { useVariations } from './hooks/sizeVariations';

type Props = PIConfettiProps & {
  ref: RefObject<ConfettiMethods | null>;
};

const PIConfetti: FC<Props> = ({
  count = DEFAULT_BOXES_COUNT,
  flakeSize = DEFAULT_FLAKE_SIZE,
  sizeVariation = 0,
  fallDuration = DEFAULT_FALL_DURATION,
  blastDuration = DEFAULT_BLAST_DURATION,
  rotation,
  colors = DEFAULT_COLORS,
  blastPosition: _blastPosition,
  onAnimationEnd,
  onAnimationStart,
  width: _width,
  height: _height,
  blastRadius = DEFAULT_BLAST_RADIUS,
  fadeOutOnEnd = false,
  ref,
  ...flakeProps
}) => {
  const _radiusRange =
    'radiusRange' in flakeProps ? flakeProps.radiusRange : undefined;
  const blastProgress = useSharedValue(0);
  const fallProgress = useSharedValue(0);
  const opacity = useDerivedValue(() => {
    if (!fadeOutOnEnd) return 1;
    return interpolate(fallProgress.get(), [0, 1], [1, 0], Extrapolation.CLAMP);
  }, [fadeOutOnEnd]);
  const running = useSharedValue(false);

  const { width: DEFAULT_SCREEN_WIDTH, height: DEFAULT_SCREEN_HEIGHT } =
    useWindowDimensions();
  const containerWidth = _width || DEFAULT_SCREEN_WIDTH;
  const containerHeight = _height || DEFAULT_SCREEN_HEIGHT + 100;
  const blastPosition = _blastPosition || { x: containerWidth / 2, y: 150 };
  const sizeVariations = useVariations({
    sizeVariation,
    flakeSize,
    _radiusRange,
  });
  const boxes = useSharedValue(
    generatePIBoxesArray({
      count,
      colorsVariations: colors.length,
      sizeVariations: sizeVariations.length,
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
    'worklet';

    running.set(false);
    cancelAnimation(blastProgress);
    cancelAnimation(fallProgress);
  };

  const reset = () => {
    'worklet';

    pause();

    blastProgress.set(0);
    fallProgress.set(0);
  };

  const refreshBoxes = () => {
    'worklet';

    const newBoxes = generatePIBoxesArray({
      count,
      colorsVariations: colors.length,
      sizeVariations: sizeVariations.length,
      rotation,
    });
    boxes.set(newBoxes);
  };

  const JSOnStart = () => onAnimationStart?.();
  const JSOnEnd = () => onAnimationEnd?.();

  const runBlastAnimation = ({
    blastDuration: _blastDuration,
    fallDuration: _fallDuration,
  }: {
    blastDuration: number;
    fallDuration: number;
  }) => {
    'worklet';
    if (_blastDuration > 0)
      blastProgress.set(withTiming(1, { duration: _blastDuration }));
    else blastProgress.set(1);
    if (_fallDuration > 0)
      fallProgress.set(
        withTiming(1, { duration: _fallDuration }, () => {
          runOnJS(JSOnEnd)();
        })
      );
    else fallProgress.set(1);
  };

  const restart = () => {
    'worklet';
    refreshBoxes();
    running.set(true);

    reset();
    runOnJS(JSOnStart)();
    runBlastAnimation({ blastDuration, fallDuration });
  };

  const resume = () => {
    'worklet';

    if (running.get()) return;
    running.set(true);
    const blastTimeLeft = (1 - blastProgress.get()) * blastDuration;
    const fallTimeLeft = (1 - fallProgress.get()) * fallDuration;
    runBlastAnimation({
      blastDuration: blastTimeLeft,
      fallDuration: fallTimeLeft,
    });
  };

  useImperativeHandle(ref, () => ({
    pause: runOnUI(pause),
    reset: runOnUI(reset),
    resume: runOnUI(resume),
    restart: runOnUI(restart),
  }));

  const getPosition = (index: number) => {
    'worklet';
    const centerX = blastPosition.x; // Horizontal center of the container
    const centerY = blastPosition.y; // Vertical center of the container
    const maxRadius = blastRadius; // Maximum radius for the circle

    // Generate a pseudo-random radius and angle based on index
    const radius = Math.sqrt((index + 1) / count) * maxRadius;
    const angle = ((index * 137.5) % 360) * (Math.PI / 180); // Using golden angle for uniform distribution

    // Calculate x and y based on radius and angle
    const x = centerX + radius * Math.cos(angle);
    const y = centerY + radius * Math.sin(angle);

    return { x, y };
  };

  const transforms = useRSXformBuffer(count, (val, i) => {
    'worklet';
    const piece = boxes.get()[i];
    if (!piece) return;

    const { x, y } = getPosition(i);

    let tx = x;
    let ty = y;

    const diffX = x - blastPosition.x;
    const diffY = y - blastPosition.y;

    const delayedBlastProgress = interpolate(
      blastProgress.get(),
      [piece.delayBlast, 1],
      [0, 1],
      Extrapolation.IDENTITY
    );

    tx += -diffX * (1 - delayedBlastProgress);
    ty += -diffY * (1 - delayedBlastProgress);

    const fallDistance = interpolate(
      fallProgress.get(),
      [0, 1],
      [0, containerHeight - blastPosition.y + blastRadius]
    );

    const spreadDistanceX = interpolate(
      fallProgress.get(),
      [0, 1],
      [0, piece.randomOffsetX]
    );
    const spreadDistanceY = interpolate(
      fallProgress.get(),
      [0, 1],
      [0, piece.randomOffsetY]
    );

    tx += spreadDistanceX;
    ty += fallDistance + spreadDistanceY;

    // Interpolate between randomX values for smooth left-right movement
    const jigglingStartPos = 0.1;
    const randomX = interpolate(
      fallProgress.get(),
      [
        0,
        jigglingStartPos,
        ...new Array(piece.randomXs.length)
          .fill(0)
          .map(
            (_, index) =>
              jigglingStartPos +
              ((index + 1) * (1 - jigglingStartPos)) / piece.randomXs.length
          ),
      ],
      [0, 0, ...piece.randomXs] // Use the randomX array for horizontal movement
    );

    tx += randomX;

    const rotationDirection = piece.clockwise ? 1 : -1;
    const rz =
      piece.initialRotation +
      interpolate(
        fallProgress.get(),
        [0, 1],
        [0, rotationDirection * piece.maxRotation.z],
        Extrapolation.CLAMP
      );
    const rx =
      piece.initialRotation +
      interpolate(
        fallProgress.get(),
        [0, 1],
        [0, rotationDirection * piece.maxRotation.x],
        Extrapolation.CLAMP
      );

    const oscillatingScale = Math.abs(Math.cos(rx)); // Scale goes from 1 -> 0 -> 1
    const blastScale = interpolate(
      blastProgress.get(),
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

PIConfetti.displayName = 'PIConfetti';
export { PIConfetti };

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
