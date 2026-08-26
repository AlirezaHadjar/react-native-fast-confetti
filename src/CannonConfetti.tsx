import { useRSXformBuffer } from '@shopify/react-native-skia';
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  forwardRef,
} from 'react';
import {
  Extrapolation,
  interpolate,
  runOnUI,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated';
import {
  generateCannonBoxesArray,
  generateCannonParticleSystemBoxesArray,
  resolveNamedPosition,
  estimateCannonDuration,
  type CannonConfig,
} from './utils';
import {
  evaluateCannonParticle,
  projectCannonParticleHeight,
} from './cannonParticleSystem';
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
import { useTextureProps } from './hooks/useTextureProps';
import { useAnimationLifecycle } from './hooks/useAnimationLifecycle';
import { useContainerDimensions } from './hooks/useContainerDimensions';
import { useReduceMotionFactor } from './hooks/useReduceMotionFactor';
import {
  isReduceMotionPieceVisible,
  scaleValueForMotion,
} from './reduceMotion';
import { ConfettiCanvas } from './ConfettiCanvas';
import { Origin, Flake } from './CannonConfettiComponents';

const CannonConfettiInner = forwardRef<
  CannonConfettiMethods,
  CannonConfettiProps
>(
  (
    {
      children,
      gravity = DEFAULT_CANNON_CONFETTI_GRAVITY,
      drag: dragProp = DEFAULT_CANNON_CONFETTI_DRAG,
      autoplay = true,
      infinite = false,
      fadeOutOnEnd = false,
      autoStartDelay = 0,
      onAnimationEnd,
      onAnimationStart,
      containerStyle,
      colors: rootColors,
      rotation: rootRotation,
      depth: rootDepth,
      speedVariation: rootSpeedVariation,
      target: rootTarget,
      particleSystem,
      sprayDuration = 300,
      initialScale = 0.3,
      flipIntensity = 0.85,
      flakeStyle = 'glossy',
      easing,
      reduceMotion,
      ...textureRootProps
    },
    ref
  ) => {
    const { factor: reduceMotionFactor, ready: reduceMotionReady } =
      useReduceMotionFactor(reduceMotion);
    const effectiveFlipIntensity = scaleValueForMotion(
      flipIntensity,
      reduceMotionFactor
    );

    const { containerWidth, containerHeight, onContainerLayout, ready } =
      useContainerDimensions(containerStyle);

    const parentTexture = useTextureProps(textureRootProps);

    // --- Resolve drag into horizontal / vertical ---
    const hDrag = typeof dragProp === 'number' ? dragProp : dragProp.horizontal;
    const vDrag = typeof dragProp === 'number' ? dragProp : dragProp.vertical;

    // --- Parse children + build atlas via hook ---
    const {
      cannonsPositions,
      cannonConfigs,
      durationCannonConfigs,
      allColors,
      sizeVariations,
      colorOverrides,
      sizeIsTextured,
      parentColorCount,
      totalCount,
      visibleCount,
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
      parentTexture,
      reduceMotionFactor,
    });

    // --- Auto-compute duration from physics ---
    const duration = particleSystem
      ? particleSystem.duration
      : estimateCannonDuration({
          cannonConfigs: durationCannonConfigs,
          cannonsPositions,
          gravity,
          drag: vDrag,
          sprayDurationMs: sprayDuration,
          containerHeight,
        });

    // --- Compute launch delay max from sprayDuration ---
    const launchDelayMax =
      sprayDuration !== undefined
        ? Math.min(sprayDuration / duration, 1)
        : DEFAULT_CANNON_CONFETTI_LAUNCH_DELAY_MAX;

    const dynamicCannonsPositions = useSharedValue<Position[] | null>(null);
    const dynamicCannonConfigs = useSharedValue<CannonConfig[] | null>(null);

    const createBoxes = useCallback(
      (configs: CannonConfig[], positions: Position[]) => {
        'worklet';
        if (particleSystem) {
          return generateCannonParticleSystemBoxesArray({
            particleSystem,
            cannonConfigs: configs,
            sizeIsTextured,
          });
        }
        return generateCannonBoxesArray({
          cannonConfigs: configs,
          cannonsPositions: positions,
          containerHeight,
          launchDelayMax,
          sizeColorOverrides: colorOverrides,
          parentColorCount,
          sizeIsTextured,
        });
      },
      [
        particleSystem,
        sizeIsTextured,
        containerHeight,
        launchDelayMax,
        colorOverrides,
        parentColorCount,
      ]
    );

    const boxes = useSharedValue(createBoxes(cannonConfigs, cannonsPositions));
    const renderedCount = particleSystem?.particles.length ?? totalCount;
    const meshParticleCount = particleSystem?.particles.length ?? 0;

    const refreshBoxes = useCallback(() => {
      'worklet';
      const currentConfigs = dynamicCannonConfigs.get() || cannonConfigs;
      const currentPositions =
        dynamicCannonsPositions.get() || cannonsPositions;
      const newBoxes = createBoxes(currentConfigs, currentPositions);
      boxes.set(newBoxes);
    }, [
      cannonConfigs,
      boxes,
      dynamicCannonConfigs,
      dynamicCannonsPositions,
      cannonsPositions,
      createBoxes,
    ]);

    const { progress, running, opacity, pause, reset, resume, runAnimation } =
      useAnimationLifecycle({
        duration,
        infinite,
        fadeOutOnEnd,
        easing,
        onAnimationStart,
        onAnimationEnd,
        onCycleEnd: refreshBoxes,
        disabled: visibleCount === 0,
      });

    const { texture, sprites } = useConfettiLogic({
      sizeVariations,
      colors: allColors,
      boxes,
      sizeColorOverrides: colorOverrides,
      count: renderedCount,
    });

    const maxAtlasWidth = Math.max(...sizeVariations.map((size) => size.width));
    const maxAtlasHeight = Math.max(
      ...sizeVariations.map((size) => size.height)
    );
    const meshIndices = useMemo(
      () =>
        Array.from({ length: meshParticleCount }, (_, index) => {
          const offset = index * 4;
          return [
            offset,
            offset + 1,
            offset + 2,
            offset,
            offset + 2,
            offset + 3,
          ];
        }).flat(),
      [meshParticleCount]
    );
    const meshTextureCoordinates = useDerivedValue(() => {
      const currentBoxes = boxes.get();
      const result = new Array(meshParticleCount * 4);
      for (let index = 0; index < meshParticleCount; index++) {
        const piece = currentBoxes[index];
        const size = piece ? sizeVariations[piece.sizeIndex] : undefined;
        const offset = index * 4;
        if (!piece || !size) {
          result[offset] = { x: 0, y: 0 };
          result[offset + 1] = { x: 0, y: 0 };
          result[offset + 2] = { x: 0, y: 0 };
          result[offset + 3] = { x: 0, y: 0 };
          continue;
        }
        const left = piece.sizeIndex * maxAtlasWidth;
        const top = piece.colorIndex * maxAtlasHeight;
        result[offset] = { x: left, y: top };
        result[offset + 1] = { x: left + size.width, y: top };
        result[offset + 2] = {
          x: left + size.width,
          y: top + size.height,
        };
        result[offset + 3] = { x: left, y: top + size.height };
      }
      return result;
    });

    const meshVertices = useDerivedValue(() => {
      if (!particleSystem) return [];
      const currentBoxes = boxes.get();
      const systemTime = progress.get() * duration;
      const result = new Array(meshParticleCount * 4);
      const viewportPadding = particleSystem.viewportPadding ?? 0.08;
      for (let index = 0; index < meshParticleCount; index++) {
        const particle = particleSystem.particles[index];
        const piece = currentBoxes[index];
        const size = piece ? sizeVariations[piece.sizeIndex] : undefined;
        const state = particle
          ? evaluateCannonParticle(particle, systemTime)
          : null;
        const offset = index * 4;
        if (
          !state ||
          !piece ||
          !size ||
          state.x < -viewportPadding ||
          state.x > 1 + viewportPadding ||
          state.y > 1 + viewportPadding
        ) {
          result[offset] = { x: -10000, y: -10000 };
          result[offset + 1] = { x: -10000, y: -10000 };
          result[offset + 2] = { x: -10000, y: -10000 };
          result[offset + 3] = { x: -10000, y: -10000 };
          continue;
        }

        const scale =
          (state.size * containerWidth) /
          Math.max(size.width, size.height, 0.001);
        const projectionY = projectCannonParticleHeight(
          state.rotationX,
          state.flipDepth
        );
        const cosine = Math.cos(state.rotation);
        const sine = Math.sin(state.rotation);
        const halfWidth = size.width / 2;
        const halfHeight = (size.height / 2) * projectionY;
        const centerX = state.x * containerWidth;
        const centerY = state.y * containerHeight;
        const corners = [
          [-halfWidth, -halfHeight],
          [halfWidth, -halfHeight],
          [halfWidth, halfHeight],
          [-halfWidth, halfHeight],
        ];
        for (let cornerIndex = 0; cornerIndex < corners.length; cornerIndex++) {
          const corner = corners[cornerIndex];
          const localX = corner?.[0] ?? 0;
          const localY = corner?.[1] ?? 0;
          result[offset + cornerIndex] = {
            x: centerX + (localX * cosine - localY * sine) * scale,
            y: centerY + (localX * sine + localY * cosine) * scale,
          };
        }
      }
      return result;
    });
    const mesh = useMemo(
      () =>
        particleSystem
          ? {
              vertices: meshVertices,
              textureCoordinates: meshTextureCoordinates,
              indices: meshIndices,
            }
          : undefined,
      [particleSystem, meshVertices, meshTextureCoordinates, meshIndices]
    );

    const workletRestart = useCallback(
      (
        resolvedPositions: Position[] | null,
        resolvedConfigs: CannonConfig[] | null,
        delay: number = 0
      ) => {
        'worklet';
        dynamicCannonsPositions.set(resolvedPositions);
        dynamicCannonConfigs.set(resolvedConfigs);
        refreshBoxes();
        runAnimation(delay);
      },
      [
        dynamicCannonsPositions,
        dynamicCannonConfigs,
        refreshBoxes,
        runAnimation,
      ]
    );

    const colorCount = allColors.length;
    const sizeCount = sizeVariations.length;

    const jsRestart = useCallback(
      (options: CannonConfettiRestartOptions = {}) => {
        let resolvedPositions: Position[] | null = null;
        let resolvedConfigs: CannonConfig[] | null = null;
        if (options.origins) {
          resolvedPositions = options.origins.map((o) =>
            resolveNamedPosition(o, containerWidth, containerHeight)
          );
          const perOriginCount = Math.max(
            1,
            Math.floor(totalCount / resolvedPositions.length)
          );

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
              spread: scaleValueForMotion(
                DEFAULT_CANNON_CONFETTI_SPREAD_ANGLE,
                reduceMotionFactor
              ),
              speed: DEFAULT_CANNON_CONFETTI_INITIAL_SPEED,
              count: perOriginCount,
              speedVariation: { ...DEFAULT_CANNON_CONFETTI_SPEED_VARIATION },
              colorStart: 0,
              colorCount,
              sizeStart: 0,
              sizeCount,
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
        colorCount,
        sizeCount,
        rootTarget,
        reduceMotionFactor,
      ]
    );

    useImperativeHandle(ref, () => ({
      pause: runOnUI(pause),
      reset: runOnUI(reset),
      resume: runOnUI(resume),
      restart: jsRestart,
    }));

    useEffect(() => {
      if (!ready || !reduceMotionReady) return;
      runOnUI(() => {
        if (visibleCount === 0) {
          if (autoplay) {
            workletRestart(null, null, 0);
          } else {
            reset();
            refreshBoxes();
          }
          return;
        }
        if (running.get()) {
          refreshBoxes();
          return;
        }
        if (autoplay) workletRestart(null, null, autoStartDelay);
      })();
    }, [
      autoplay,
      autoStartDelay,
      workletRestart,
      running,
      ready,
      reset,
      refreshBoxes,
      visibleCount,
      reduceMotionReady,
    ]);

    // Physics constants scaled to container height
    const scaledGravity = gravity * containerHeight;
    // Duration in seconds for physics equations
    const totalTime = duration / 1000;

    const atlasParticleCount = particleSystem ? 0 : renderedCount;
    const transforms = useRSXformBuffer(atlasParticleCount, (val, i) => {
      'worklet';
      if (!isReduceMotionPieceVisible(i, renderedCount, visibleCount)) {
        val.set(0, 0, -10000, -10000);
        return;
      }

      const piece = boxes.get()[i];
      if (!piece) {
        val.set(0, 0, -10000, -10000);
        return;
      }

      const currentCannons = dynamicCannonsPositions.get() || cannonsPositions;
      const cannon = currentCannons[piece.cannonIndex % currentCannons.length];
      if (!cannon) {
        val.set(0, 0, -10000, -10000);
        return;
      }
      const cannonX = cannon.x;
      const cannonY = cannon.y;

      const { vx, vy } = piece;

      const p = progress.get();

      const effectiveProgress = interpolate(
        p,
        [piece.launchDelay, 1],
        [0, 1],
        Extrapolation.CLAMP
      );
      const t = effectiveProgress * totalTime;

      let tx: number;
      let ty: number;
      const normalizedT = Math.min(t / totalTime, 1);
      const hDecayFactor = 1 - Math.pow(1 - normalizedT, hDrag + 1);
      const vExpDecay = 1 - Math.exp(-vDrag * t);
      const safeVDrag = Math.max(vDrag, 0.001);
      tx = cannonX + ((vx * totalTime) / (hDrag + 1)) * hDecayFactor;
      ty =
        cannonY +
        (scaledGravity / safeVDrag) * t +
        ((vy - scaledGravity / safeVDrag) / safeVDrag) * vExpDecay;

      const rotationDirection = piece.clockwise ? 1 : -1;
      const rz =
        piece.initialRotation + p * rotationDirection * piece.maxRotation.z;
      const rx =
        piece.initialRotation + p * rotationDirection * piece.maxRotation.x;

      const minFlipScale = 1 - effectiveFlipIntensity;
      const oscillatingScale =
        piece.maxRotation.x === 0
          ? 1
          : Math.max(Math.abs(Math.cos(rx)), minFlipScale);
      const appearScale = interpolate(
        effectiveProgress,
        [0, 0.05],
        [initialScale, 1],
        Extrapolation.CLAMP
      );
      const size = sizeVariations[piece.sizeIndex];
      if (!size) {
        val.set(0, 0, -10000, -10000);
        return;
      }
      const px = size.width / 2;
      const py = size.height / 2;
      const scale = appearScale * oscillatingScale * piece.depthScale;

      const s = Math.sin(rz) * scale;
      const c = Math.cos(rz) * scale;

      val.set(c, s, tx - c * px + s * py, ty - s * px - c * py);
    });

    return (
      <ConfettiCanvas
        containerStyle={containerStyle}
        ready={ready && reduceMotionReady}
        texture={texture}
        sprites={sprites}
        transforms={transforms}
        opacity={opacity}
        mesh={mesh}
        onContainerLayout={onContainerLayout}
      />
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
