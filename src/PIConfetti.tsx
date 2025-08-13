import { useRSXformBuffer, Canvas, Atlas } from '@shopify/react-native-skia';
import { useImperativeHandle, forwardRef, useCallback, useMemo } from 'react';
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
import type {
  PIConfettiMethods,
  PIConfettiProps,
  PIConfettiRestartOptions,
  Position,
} from './types';
import { useConfettiLogic } from './hooks/useConfettiLogic';
import { useVariations } from './hooks/sizeVariations';

const PIConfetti = forwardRef<PIConfettiMethods, PIConfettiProps>(
  (
    {
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
      containerStyle,
      ...flakeProps
    },
    ref
  ) => {
    const _radiusRange =
      'radiusRange' in flakeProps ? flakeProps.radiusRange : undefined;
    const blastProgress = useSharedValue(0);
    const fallProgress = useSharedValue(0);
    const opacity = useDerivedValue(() => {
      if (!fadeOutOnEnd) return 1;
      return interpolate(
        fallProgress.get(),
        [0, 1],
        [1, 0],
        Extrapolation.CLAMP
      );
    }, [fadeOutOnEnd]);
    const running = useSharedValue(false);

    const { width: DEFAULT_SCREEN_WIDTH, height: DEFAULT_SCREEN_HEIGHT } =
      useWindowDimensions();
    const containerWidth = _width || DEFAULT_SCREEN_WIDTH;
    const containerHeight = _height || DEFAULT_SCREEN_HEIGHT + 100;
    const defaultBlastPosition = useMemo(() => {
      return (
        _blastPosition || {
          x: containerWidth / 2,
          y: 150,
        }
      );
    }, [_blastPosition, containerWidth]);

    // Store dynamic blast position - can be overridden via restart method
    const dynamicBlastPosition = useSharedValue<Position | null>(null);
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

    const pause = useCallback(() => {
      'worklet';

      running.set(false);
      cancelAnimation(blastProgress);
      cancelAnimation(fallProgress);
    }, [blastProgress, fallProgress, running]);

    const reset = useCallback(() => {
      'worklet';

      pause();

      blastProgress.set(0);
      fallProgress.set(0);
    }, [blastProgress, fallProgress, pause]);

    const refreshBoxes = useCallback(() => {
      'worklet';

      const newBoxes = generatePIBoxesArray({
        count,
        colorsVariations: colors.length,
        sizeVariations: sizeVariations.length,
        rotation,
      });
      boxes.set(newBoxes);
    }, [count, colors.length, sizeVariations.length, rotation, boxes]);

    const JSOnStart = useCallback(
      () => onAnimationStart?.(),
      [onAnimationStart]
    );
    const JSOnEnd = useCallback(() => onAnimationEnd?.(), [onAnimationEnd]);

    const runBlastAnimation = useCallback(
      ({
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
      },
      [JSOnEnd, blastProgress, fallProgress]
    );

    const restart = useCallback(
      (options: PIConfettiRestartOptions = {}) => {
        'worklet';

        // Update dynamic blast position if provided
        dynamicBlastPosition.set(options.blastPosition || null);

        refreshBoxes();
        reset();
        running.set(true);
        runOnJS(JSOnStart)();
        runBlastAnimation({ blastDuration, fallDuration });
      },
      [
        refreshBoxes,
        reset,
        running,
        JSOnStart,
        runBlastAnimation,
        blastDuration,
        fallDuration,
        dynamicBlastPosition,
      ]
    );

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
      const currentBlastPosition =
        dynamicBlastPosition.get() || defaultBlastPosition;
      const centerX = currentBlastPosition.x; // Horizontal center of the container
      const centerY = currentBlastPosition.y; // Vertical center of the container
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

      const currentBlastPosition =
        dynamicBlastPosition.get() || defaultBlastPosition;
      const diffX = x - currentBlastPosition.x;
      const diffY = y - currentBlastPosition.y;

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
        [0, containerHeight - currentBlastPosition.y + blastRadius]
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
