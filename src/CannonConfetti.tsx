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
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { generateCannonBoxesArray } from './utils';
import {
  DEFAULT_BOXES_COUNT,
  DEFAULT_COLORS,
  DEFAULT_FLAKE_SIZE,
  DEFAULT_CANNON_CONFETTI_DURATION,
  DEFAULT_CANNON_CONFETTI_GRAVITY,
  DEFAULT_CANNON_CONFETTI_DRAG,
  DEFAULT_CANNON_CONFETTI_INITIAL_SPEED,
  DEFAULT_CANNON_CONFETTI_SPREAD_ANGLE,
  DEFAULT_CANNON_CONFETTI_SPEED_VARIATION,
  DEFAULT_CANNON_CONFETTI_DEPTH,
} from './constants';
import type {
  CannonConfettiMethods,
  CannonConfettiProps,
  CannonConfettiRestartOptions,
  Position,
} from './types';
import { useConfettiLogic } from './hooks/useConfettiLogic';
import { useVariations } from './hooks/sizeVariations';

const CannonConfetti = forwardRef<CannonConfettiMethods, CannonConfettiProps>(
  (
    {
      cannonsPositions,
      count = DEFAULT_BOXES_COUNT,
      flakeSize = DEFAULT_FLAKE_SIZE,
      duration = DEFAULT_CANNON_CONFETTI_DURATION,
      gravity = DEFAULT_CANNON_CONFETTI_GRAVITY,
      drag = DEFAULT_CANNON_CONFETTI_DRAG,
      initialSpeed = DEFAULT_CANNON_CONFETTI_INITIAL_SPEED,
      spreadAngle = DEFAULT_CANNON_CONFETTI_SPREAD_ANGLE,
      speedVariation = DEFAULT_CANNON_CONFETTI_SPEED_VARIATION,
      depth = DEFAULT_CANNON_CONFETTI_DEPTH,
      colors = DEFAULT_COLORS,
      rotation,
      autoplay = true,
      isInfinite = false,
      fadeOutOnEnd = false,
      onAnimationEnd,
      onAnimationStart,
      width: _width,
      height: _height,
      containerStyle,
      ...flakeProps
    },
    ref
  ) => {
    const _radiusRange =
      'radiusRange' in flakeProps ? flakeProps.radiusRange : undefined;

    const dynamicCannonsPositions = useSharedValue<Position[] | null>(null);

    const progress = useSharedValue(0);
    const running = useSharedValue(false);

    const { width: DEFAULT_SCREEN_WIDTH, height: DEFAULT_SCREEN_HEIGHT } =
      useWindowDimensions();
    const containerWidth = _width || DEFAULT_SCREEN_WIDTH;
    const containerHeight = _height || DEFAULT_SCREEN_HEIGHT;

    const opacity = useDerivedValue(() => {
      if (!fadeOutOnEnd) return 1;
      return interpolate(
        progress.get(),
        [0.8, 1],
        [1, 0],
        Extrapolation.CLAMP
      );
    }, [fadeOutOnEnd]);

    const sizeVariations = useVariations({
      flakeSize,
      _radiusRange,
    });

    const boxes = useSharedValue(
      generateCannonBoxesArray({
        count,
        colorsVariations: colors.length,
        sizeVariations: sizeVariations.length,
        cannonsCount: cannonsPositions.length,
        rotation,
        speedVariation,
        spreadAngle,
        depth,
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
      cancelAnimation(progress);
    };

    const reset = () => {
      'worklet';
      pause();
      progress.set(0);
    };

    const refreshBoxes = useCallback(() => {
      'worklet';
      const currentCannons =
        dynamicCannonsPositions.get() || cannonsPositions;
      const newBoxes = generateCannonBoxesArray({
        count,
        colorsVariations: colors.length,
        sizeVariations: sizeVariations.length,
        cannonsCount: currentCannons.length,
        rotation,
        speedVariation,
        spreadAngle,
        depth,
      });
      boxes.set(newBoxes);
    }, [
      count,
      colors.length,
      sizeVariations.length,
      cannonsPositions,
      boxes,
      rotation,
      speedVariation,
      spreadAngle,
      depth,
      dynamicCannonsPositions,
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
      (options: CannonConfettiRestartOptions = {}) => {
        'worklet';

        dynamicCannonsPositions.set(options.cannonsPositions || null);
        refreshBoxes();
        progress.set(0);
        running.set(true);
        UIOnStart();

        function repeatAnimation() {
          'worklet';
          UIOnEnd();
          refreshBoxes();
          if (isInfinite) {
            cancelAnimation(progress);
            progress.set(0);
            progress.set(
              withTiming(1, { duration, easing: Easing.linear }, (finished) => {
                'worklet';
                if (!finished || !isInfinite) return;
                repeatAnimation();
              })
            );
          }
        }

        progress.set(
          withTiming(1, { duration, easing: Easing.linear }, (finished) => {
            'worklet';
            if (!finished || !isInfinite) {
              if (finished) UIOnEnd();
              return;
            }
            repeatAnimation();
          })
        );
      },
      [
        dynamicCannonsPositions,
        refreshBoxes,
        progress,
        running,
        UIOnStart,
        UIOnEnd,
        isInfinite,
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
        refreshBoxes();
        if (isInfinite) {
          cancelAnimation(progress);
          progress.set(0);
          progress.set(
            withTiming(1, { duration, easing: Easing.linear }, (finished) => {
              'worklet';
              if (!finished || !isInfinite) return;
              repeatAnimation();
            })
          );
        }
      }

      progress.set(
        withTiming(1, { duration: remaining, easing: Easing.linear }, (finished) => {
          'worklet';
          if (!finished || !isInfinite) {
            if (finished) UIOnEnd();
            return;
          }
          repeatAnimation();
        })
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

    // Physics constants scaled to container height
    const scaledGravity = gravity * containerHeight;
    const scaledInitialSpeed = initialSpeed * containerHeight;
    // Duration in seconds for physics equations
    const totalTime = duration / 1000;

    const transforms = useRSXformBuffer(count, (val, i) => {
      'worklet';
      const piece = boxes.get()[i];
      if (!piece) return;

      const currentCannons =
        dynamicCannonsPositions.get() || cannonsPositions;
      const cannon = currentCannons[piece.cannonIndex % currentCannons.length]!;
      const cannonX = cannon.x;
      const cannonY = cannon.y;

      // Auto-aim: base angle points from cannon toward center-top of screen
      const targetX = containerWidth / 2;
      const targetY = 0;
      const baseAngle = Math.atan2(targetY - cannonY, targetX - cannonX);

      const angle = baseAngle + piece.angleOffset;
      const speed = scaledInitialSpeed * piece.speedMultiplier * piece.depthScale;
      const vx = speed * Math.cos(angle);
      const vy = speed * Math.sin(angle);

      // Current time based on progress, accounting for launch delay
      const effectiveProgress = interpolate(
        progress.get(),
        [piece.launchDelay, 1],
        [0, 1],
        Extrapolation.CLAMP
      );
      const t = effectiveProgress * totalTime;

      // Physics: vertical with gravity
      const tx = cannonX + (vx / drag) * (1 - Math.exp(-drag * t));
      const ty = cannonY + vy * t + 0.5 * scaledGravity * t * t;

      // Rotation
      const rotationDirection = piece.clockwise ? 1 : -1;
      const rz =
        piece.initialRotation +
        interpolate(
          progress.get(),
          [0, 1],
          [0, rotationDirection * piece.maxRotation.z],
          Extrapolation.CLAMP
        );
      const rx =
        piece.initialRotation +
        interpolate(
          progress.get(),
          [0, 1],
          [0, rotationDirection * piece.maxRotation.x],
          Extrapolation.CLAMP
        );

      // Scale: appearance animation at launch + oscillation
      const oscillatingScale = Math.abs(Math.cos(rx));
      const appearScale = interpolate(
        effectiveProgress,
        [0, 0.05],
        [0, 1],
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

CannonConfetti.displayName = 'CannonConfetti';
export { CannonConfetti };

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
