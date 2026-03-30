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
  runOnUI,
  useDerivedValue,
  useSharedValue,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import {
  generatePIBoxesArray,
  resolveNamedPosition,
  estimatePIDuration,
} from './utils';
import {
  DEFAULT_BOXES_COUNT,
  DEFAULT_PI_CONFETTI_GRAVITY,
  DEFAULT_PI_CONFETTI_DRAG,
  DEFAULT_PI_CONFETTI_INITIAL_SPEED,
  DEFAULT_PI_CONFETTI_SPREAD,
  DEFAULT_PI_CONFETTI_LAUNCH_DELAY_MAX,
} from './constants';
import type {
  PIConfettiMethods,
  PIConfettiProps,
  PIConfettiRestartOptions,
  Position,
} from './types';
import { useConfettiLogic } from './hooks/useConfettiLogic';
import { useConfettiFlakes } from './hooks/useConfettiFlakes';
import { useAnimationCallbacks } from './hooks/useAnimationCallbacks';
import { Flake } from './FlakeComponent';

const PIConfettiInner = forwardRef<PIConfettiMethods, PIConfettiProps>(
  (
    {
      children,
      count = DEFAULT_BOXES_COUNT,
      colors: rootColors,
      gravity = DEFAULT_PI_CONFETTI_GRAVITY,
      drag: dragProp = DEFAULT_PI_CONFETTI_DRAG,
      initialSpeed = DEFAULT_PI_CONFETTI_INITIAL_SPEED,
      spread = DEFAULT_PI_CONFETTI_SPREAD,
      speedVariation,
      blastPosition: _blastPosition,
      autoplay = true,
      infinite = false,
      fadeOutOnEnd = false,
      autoStartDelay = 0,
      rotation,
      depth,
      flakeStyle = 'glossy',
      initialScale = 0.3,
      flipIntensity = 0.85,
      sprayDuration,
      onAnimationEnd,
      onAnimationStart,
      containerStyle,
    },
    ref
  ) => {
    const { width: DEFAULT_SCREEN_WIDTH, height: DEFAULT_SCREEN_HEIGHT } =
      useWindowDimensions();
    const flatStyle = StyleSheet.flatten(containerStyle);
    const containerWidth =
      (typeof flatStyle?.width === 'number' ? flatStyle.width : null) ??
      DEFAULT_SCREEN_WIDTH;
    const containerHeight =
      (typeof flatStyle?.height === 'number' ? flatStyle.height : null) ??
      DEFAULT_SCREEN_HEIGHT;

    // --- Resolve drag into horizontal / vertical ---
    const hDrag = typeof dragProp === 'number' ? dragProp : dragProp.horizontal;
    const vDrag = typeof dragProp === 'number' ? dragProp : dragProp.vertical;

    // --- Parse children for flake sizes ---
    const { allColors, sizeVariations, sizeColorOverrides } = useConfettiFlakes(
      {
        children,
        rootColors,
        rootFlakeStyle: flakeStyle,
      }
    );

    // --- Resolve blast position ---
    const defaultBlastPosition = useMemo(() => {
      if (_blastPosition == null) {
        return { x: containerWidth / 2, y: 150 };
      }
      if (typeof _blastPosition === 'object') {
        return _blastPosition;
      }
      return resolveNamedPosition(
        _blastPosition,
        containerWidth,
        containerHeight
      );
    }, [_blastPosition, containerWidth, containerHeight]);

    // --- Auto-compute duration from physics ---
    const duration = estimatePIDuration({
      initialSpeed,
      gravity,
      vDrag,
      depth,
      speedVariation,
      sprayDurationMs: sprayDuration,
      containerHeight,
      blastY: defaultBlastPosition.y,
    });

    // --- Compute launch delay max from sprayDuration ---
    const launchDelayMax =
      sprayDuration !== undefined
        ? Math.min(sprayDuration / duration, 1)
        : DEFAULT_PI_CONFETTI_LAUNCH_DELAY_MAX;

    const dynamicBlastPosition = useSharedValue<Position | null>(null);
    const progress = useSharedValue(0);
    const running = useSharedValue(false);

    const opacity = useDerivedValue(() => {
      if (!fadeOutOnEnd) return 1;
      return interpolate(
        progress.get(),
        [0.5, 0.9],
        [1, 0],
        Extrapolation.CLAMP
      );
    }, [fadeOutOnEnd]);

    const boxes = useSharedValue(
      generatePIBoxesArray({
        count,
        colorsVariations: allColors.length,
        sizeVariations: sizeVariations.length,
        sizeColorOverrides,
        spread,
        rotation,
        speedVariation,
        depth,
        launchDelayMax,
      })
    );

    const { texture, sprites } = useConfettiLogic({
      sizeVariations,
      colors: allColors,
      boxes,
      sizeColorOverrides,
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
      const newBoxes = generatePIBoxesArray({
        count,
        colorsVariations: allColors.length,
        sizeVariations: sizeVariations.length,
        sizeColorOverrides,
        spread,
        rotation,
        speedVariation,
        depth,
        launchDelayMax,
      });
      boxes.set(newBoxes);
    }, [
      count,
      allColors.length,
      sizeVariations.length,
      sizeColorOverrides,
      spread,
      rotation,
      speedVariation,
      depth,
      launchDelayMax,
      boxes,
    ]);

    const { UIOnStart, UIOnEnd } = useAnimationCallbacks(
      onAnimationStart,
      onAnimationEnd
    );

    const workletRestart = useCallback(
      (resolvedPosition: Position | null, delay: number = 0) => {
        'worklet';

        dynamicBlastPosition.set(resolvedPosition);
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
              withTiming(1, { duration, easing: Easing.linear }, (finished) => {
                'worklet';
                if (!finished || !infinite) return;
                repeatAnimation();
              })
            );
          }
        }

        const animation = withTiming(
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

        progress.set(delay > 0 ? withDelay(delay, animation) : animation);
      },
      [
        dynamicBlastPosition,
        refreshBoxes,
        progress,
        running,
        UIOnStart,
        UIOnEnd,
        infinite,
        duration,
      ]
    );

    const jsRestart = useCallback(
      (options: PIConfettiRestartOptions = {}) => {
        let resolvedPosition: Position | null = null;
        if (options.blastPosition != null) {
          resolvedPosition =
            typeof options.blastPosition === 'object'
              ? options.blastPosition
              : resolveNamedPosition(
                  options.blastPosition,
                  containerWidth,
                  containerHeight
                );
        }
        runOnUI(workletRestart)(resolvedPosition);
      },
      [workletRestart, containerWidth, containerHeight]
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
      restart: jsRestart,
    }));

    useEffect(() => {
      runOnUI(() => {
        if (autoplay && !running.get()) workletRestart(null, autoStartDelay);
      })();
    }, [autoplay, autoStartDelay, workletRestart, running]);

    // Physics constants scaled to container height
    const scaledGravity = gravity * containerHeight;
    // Duration in seconds for physics equations
    const totalTime = duration / 1000;

    const transforms = useRSXformBuffer(count, (val, i) => {
      'worklet';
      const piece = boxes.get()[i];
      if (!piece || !running.get()) {
        val.set(0, 0, -10000, -10000);
        return;
      }

      const currentBlastPosition =
        dynamicBlastPosition.get() || defaultBlastPosition;
      const blastX = currentBlastPosition.x;
      const blastY = currentBlastPosition.y;

      const speed =
        initialSpeed *
        containerHeight *
        piece.speedMultiplier *
        piece.depthScale;
      const vx = speed * Math.cos(piece.angle);
      const vy = speed * Math.sin(piece.angle);

      const p = progress.get();

      // Current time based on progress, accounting for launch delay
      const effectiveProgress = interpolate(
        p,
        [piece.launchDelay, 1],
        [0, 1],
        Extrapolation.CLAMP
      );
      const t = effectiveProgress * totalTime;

      // Physics: separate drag for horizontal and vertical axes
      const safeHDrag = Math.max(hDrag, 0.001);
      const safeVDrag = Math.max(vDrag, 0.001);
      const hExpDecay = 1 - Math.exp(-safeHDrag * t);
      const vExpDecay = 1 - Math.exp(-safeVDrag * t);
      const tx = blastX + (vx / safeHDrag) * hExpDecay;
      const ty =
        blastY +
        (scaledGravity / safeVDrag) * t +
        ((vy - scaledGravity / safeVDrag) / safeVDrag) * vExpDecay;

      // Rotation
      const rotationDirection = piece.clockwise ? 1 : -1;
      const rz =
        piece.initialRotation +
        interpolate(
          p,
          [0, 1],
          [0, rotationDirection * piece.maxRotation.z],
          Extrapolation.CLAMP
        );
      const rx =
        piece.initialRotation +
        interpolate(
          p,
          [0, 1],
          [0, rotationDirection * piece.maxRotation.x],
          Extrapolation.CLAMP
        );

      // Scale: appearance animation at launch + oscillation
      const minFlipScale = 1 - flipIntensity;
      const oscillatingScale = Math.max(Math.abs(Math.cos(rx)), minFlipScale);
      const appearScale = interpolate(
        effectiveProgress,
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

PIConfettiInner.displayName = 'PIConfetti';

const PIConfetti = PIConfettiInner as typeof PIConfettiInner & {
  Flake: typeof Flake;
};

PIConfetti.Flake = Flake;

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
