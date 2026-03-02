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
  Easing,
} from 'react-native-reanimated';
import {
  generateCannonBoxesArray,
  resolveNamedPosition,
  estimateCannonDuration,
  type CannonConfig,
} from './utils';
import {
  DEFAULT_CANNON_CONFETTI_GRAVITY,
  DEFAULT_CANNON_CONFETTI_DRAG,
  DEFAULT_CANNON_CONFETTI_INITIAL_SPEED,
  DEFAULT_CANNON_CONFETTI_SPREAD_ANGLE,
  DEFAULT_CANNON_CONFETTI_SPEED_VARIATION,
  DEFAULT_CANNON_CONFETTI_LAUNCH_DELAY_MAX,
} from './constants';
import type {
  CannonConfettiMethods,
  CannonConfettiProps,
  CannonConfettiRestartOptions,
  NamedPosition,
  Position,
} from './types';
import { useConfettiLogic } from './hooks/useConfettiLogic';
import { useCannonOrigins } from './hooks/useCannonOrigins';
import { Origin, Flake } from './CannonConfettiComponents';

const CannonConfettiInner = forwardRef<
  CannonConfettiMethods,
  CannonConfettiProps
>(
  (
    {
      children,
      gravity = DEFAULT_CANNON_CONFETTI_GRAVITY,
      drag = DEFAULT_CANNON_CONFETTI_DRAG,
      autoplay = true,
      infinite = false,
      fadeOutOnEnd = false,
      onAnimationEnd,
      onAnimationStart,
      width: _width,
      height: _height,
      containerStyle,
      colors: rootColors,
      rotation: rootRotation,
      depth: rootDepth,
      speedVariation: rootSpeedVariation,
      target: rootTarget,
      sprayDuration,
      initialScale = 0.3,
      flakeStyle = 'solid',
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
    const {
      cannonsPositions,
      cannonConfigs,
      allColors,
      sizeVariations,
      totalCount,
    } = useCannonOrigins({
      children,
      rootColors,
      rootRotation,
      rootDepth,
      rootSpeedVariation,
      rootTarget,
      rootFlakeStyle: flakeStyle,
      containerWidth,
      containerHeight,
      hasTexture,
    });

    // --- Auto-compute duration from physics ---
    const duration = estimateCannonDuration({
      cannonConfigs,
      gravity,
      drag,
      sprayDurationMs: sprayDuration,
    });

    // --- Compute launch delay max from sprayDuration ---
    const launchDelayMax =
      sprayDuration !== undefined
        ? Math.min(sprayDuration / duration, 1)
        : DEFAULT_CANNON_CONFETTI_LAUNCH_DELAY_MAX;

    const dynamicCannonsPositions = useSharedValue<Position[] | null>(null);
    const dynamicCannonConfigs = useSharedValue<CannonConfig[] | null>(null);

    const progress = useSharedValue(0);
    const running = useSharedValue(false);

    const opacity = useDerivedValue(() => {
      if (!fadeOutOnEnd) return 1;
      return interpolate(progress.get(), [0.8, 1], [1, 0], Extrapolation.CLAMP);
    }, [fadeOutOnEnd]);

    const boxes = useSharedValue(
      generateCannonBoxesArray({
        cannonConfigs,
        launchDelayMax,
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
      const currentConfigs = dynamicCannonConfigs.get() || cannonConfigs;
      const newBoxes = generateCannonBoxesArray({
        cannonConfigs: currentConfigs,
        launchDelayMax,
      });
      boxes.set(newBoxes);
    }, [cannonConfigs, boxes, dynamicCannonConfigs, launchDelayMax]);

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

    const workletRestart = useCallback(
      (
        resolvedPositions: Position[] | null,
        resolvedConfigs: CannonConfig[] | null
      ) => {
        'worklet';

        dynamicCannonsPositions.set(resolvedPositions);
        dynamicCannonConfigs.set(resolvedConfigs);
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

        progress.set(
          withTiming(1, { duration, easing: Easing.linear }, (finished) => {
            'worklet';
            if (!finished || !infinite) {
              if (finished) UIOnEnd();
              return;
            }
            repeatAnimation();
          })
        );
      },
      [
        dynamicCannonsPositions,
        dynamicCannonConfigs,
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
      (options: CannonConfettiRestartOptions = {}) => {
        let resolvedPositions: Position[] | null = null;
        let resolvedConfigs: CannonConfig[] | null = null;
        if (options.origins) {
          resolvedPositions = options.origins.map((o) =>
            resolveNamedPosition(o, containerWidth, containerHeight)
          );
          // For dynamically-provided origins, distribute totalCount evenly
          // and reuse the original allColors/allSizes from the last children parse
          const perOriginCount = Math.max(
            1,
            Math.floor(totalCount / resolvedPositions.length)
          );

          // Resolve the default target for origins that don't have an explicit one
          const defaultTarget: Position =
            rootTarget != null
              ? resolveNamedPosition(
                  rootTarget,
                  containerWidth,
                  containerHeight
                )
              : { x: containerWidth / 2, y: 0 };

          resolvedConfigs = resolvedPositions.map((_, index) => {
            const target =
              options.targets?.[index] != null
                ? resolveNamedPosition(
                    options.targets[index] as NamedPosition | Position,
                    containerWidth,
                    containerHeight
                  )
                : defaultTarget;

            return {
              spread: DEFAULT_CANNON_CONFETTI_SPREAD_ANGLE,
              speed: DEFAULT_CANNON_CONFETTI_INITIAL_SPEED,
              count: perOriginCount,
              speedVariation: { ...DEFAULT_CANNON_CONFETTI_SPEED_VARIATION },
              colorStart: 0,
              colorCount: allColors.length,
              sizeStart: 0,
              sizeCount: sizeVariations.length,
              target,
            };
          });
        }
        runOnUI(workletRestart)(resolvedPositions, resolvedConfigs);
      },
      [
        workletRestart,
        containerWidth,
        containerHeight,
        totalCount,
        allColors.length,
        sizeVariations.length,
        rootTarget,
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
        if (autoplay && !running.get()) workletRestart(null, null);
      })();
    }, [autoplay, workletRestart, running]);

    // Physics constants scaled to container height
    const scaledGravity = gravity * containerHeight;
    // Duration in seconds for physics equations
    const totalTime = duration / 1000;

    const transforms = useRSXformBuffer(totalCount, (val, i) => {
      'worklet';
      const piece = boxes.get()[i];
      if (!piece) return;

      const currentCannons = dynamicCannonsPositions.get() || cannonsPositions;
      const cannon = currentCannons[piece.cannonIndex % currentCannons.length]!;
      const cannonX = cannon.x;
      const cannonY = cannon.y;

      // Base angle points from cannon toward the piece's baked target
      const baseAngle = Math.atan2(
        piece.targetY - cannonY,
        piece.targetX - cannonX
      );

      const angle = baseAngle + piece.angleOffset;
      const speed =
        piece.cannonSpeed *
        containerHeight *
        piece.speedMultiplier *
        piece.depthScale;
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

      // Physics: drag applied to both axes, gravity on vertical
      const expDecay = 1 - Math.exp(-drag * t);
      const tx = cannonX + (vx / drag) * expDecay;
      const ty =
        cannonY +
        (scaledGravity / drag) * t +
        ((vy - scaledGravity / drag) / drag) * expDecay;

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

CannonConfettiInner.displayName = 'CannonConfetti';

const CannonConfetti = CannonConfettiInner as typeof CannonConfettiInner & {
  Origin: typeof Origin;
  Flake: typeof Flake;
};

CannonConfetti.Origin = Origin;
CannonConfetti.Flake = Flake;

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
