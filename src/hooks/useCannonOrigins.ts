import { useMemo } from 'react';
import type {
  CannonOriginProps,
  CannonFlakeProps,
  FlakeSize,
  NamedPosition,
  Position,
  Range,
  Rotation,
} from '../types';
import type { CannonConfig } from '../utils';
import { resolveNamedPosition } from '../utils';
import { pickChildren } from '../children';
import { Origin, Flake } from '../CannonConfettiComponents';
import {
  DEFAULT_COLORS,
  DEFAULT_FLAKE_SIZE,
  DEFAULT_CANNON_CONFETTI_SPREAD_ANGLE,
  DEFAULT_CANNON_CONFETTI_INITIAL_SPEED,
  DEFAULT_CANNON_CONFETTI_SPEED_VARIATION,
  DEFAULT_CANNON_CONFETTI_DEPTH,
  DEFAULT_CANNON_ORIGIN_COUNT,
} from '../constants';

type UseCannonOriginsParams = {
  children: React.ReactNode;
  rootColors?: string[];
  rootRotation?: Rotation;
  rootDepth?: Range;
  rootSpeedVariation?: Range;
  rootTarget?: NamedPosition | Position;
  containerWidth: number;
  containerHeight: number;
  hasTexture: boolean;
};

type UseCannonOriginsResult = {
  cannonsPositions: Position[];
  cannonConfigs: CannonConfig[];
  allColors: string[];
  sizeVariations: { width: number; height: number; radius: number }[];
  totalCount: number;
};

export const useCannonOrigins = ({
  children,
  rootColors,
  rootRotation,
  rootDepth,
  rootSpeedVariation,
  rootTarget,
  containerWidth,
  containerHeight,
  hasTexture,
}: UseCannonOriginsParams): UseCannonOriginsResult => {
  const { targetChildren: originChildren } = pickChildren<CannonOriginProps>(
    children,
    Origin
  );

  // --- Dev-mode validations ---
  if (__DEV__) {
    if (!originChildren || originChildren.length === 0) {
      console.warn(
        'CannonConfetti: at least one <CannonConfetti.Origin> child is required.'
      );
    }
    if (originChildren && originChildren.length > 1) {
      const seen = new Set<string>();
      for (const o of originChildren) {
        const pos = o.props.position;
        if (typeof pos === 'string') {
          if (seen.has(pos)) {
            console.warn(
              `CannonConfetti: duplicate named position "${pos}" detected. Each Origin should have a unique position.`
            );
          }
          seen.add(pos);
        }
      }
    }
    if (hasTexture) {
      for (const o of originChildren ?? []) {
        if (o.props.colors) {
          console.warn(
            'CannonConfetti: `colors` on Origin is ignored when `image` or `svg` is set on the root. Colors are not used with textures.'
          );
          break;
        }
      }
    }
  }

  // --- Build per-origin atlas data ---
  const { cannonsPositions, cannonConfigs, allColors, allSizes, totalCount } =
    useMemo(() => {
      const origins = originChildren ?? [];
      const positions: Position[] = [];
      const configs: CannonConfig[] = [];
      const colorsAccum: string[] = [];
      const sizesAccum: FlakeSize[] = [];
      let count = 0;

      for (const origin of origins) {
        const props = origin.props;
        positions.push(
          resolveNamedPosition(props.position, containerWidth, containerHeight)
        );

        // Resolve target: origin.target → rootTarget → center-top default
        const resolvedTarget =
          props.target != null
            ? resolveNamedPosition(props.target, containerWidth, containerHeight)
            : rootTarget != null
              ? resolveNamedPosition(rootTarget, containerWidth, containerHeight)
              : { x: containerWidth / 2, y: 0 };

        // Extract Flake children from this Origin
        const { targetChildren: flakeChildren } =
          pickChildren<CannonFlakeProps>(props.children, Flake);

        // Build flake sizes for this origin (NO min-size padding)
        let originSizes: FlakeSize[];
        if (flakeChildren && flakeChildren.length > 0) {
          originSizes = flakeChildren.map((f) => {
            const fProps = f.props;
            if ('size' in fProps && fProps.size != null) {
              return {
                width: fProps.size,
                height: fProps.size,
                radius: fProps.radius,
              };
            }
            return {
              width: (fProps as { width: number }).width,
              height: (fProps as { height: number }).height,
              radius: fProps.radius,
            };
          });
        } else {
          originSizes = DEFAULT_FLAKE_SIZE;
        }

        // Resolution chain: origin prop → root prop → constant default
        const originColors = props.colors ?? rootColors ?? DEFAULT_COLORS;
        const originCount = props.count ?? DEFAULT_CANNON_ORIGIN_COUNT;

        // Atlas collapse: when texture is set, colors are not used.
        // All origins share a single color placeholder and a deduplicated
        // size pool to avoid duplicate atlas cells (which cause rendering
        // issues with Skia's useTexture).
        if (hasTexture) {
          if (colorsAccum.length === 0) {
            colorsAccum.push('#000');
          }
          // Deduplicate sizes: only add sizes not already present
          for (const size of originSizes) {
            const exists = sizesAccum.some(
              (s) =>
                s.width === size.width &&
                s.height === size.height &&
                s.radius === size.radius
            );
            if (!exists) {
              sizesAccum.push(size);
            }
          }

          configs.push({
            spread: props.spread ?? DEFAULT_CANNON_CONFETTI_SPREAD_ANGLE,
            speed: props.speed ?? DEFAULT_CANNON_CONFETTI_INITIAL_SPEED,
            count: originCount,
            speedVariation: {
              min:
                props.speedVariation?.min ??
                rootSpeedVariation?.min ??
                DEFAULT_CANNON_CONFETTI_SPEED_VARIATION.min,
              max:
                props.speedVariation?.max ??
                rootSpeedVariation?.max ??
                DEFAULT_CANNON_CONFETTI_SPEED_VARIATION.max,
            },
            colorStart: 0,
            colorCount: 1,
            sizeStart: 0,
            sizeCount: sizesAccum.length,
            rotation: props.rotation ?? rootRotation,
            depth: props.depth ?? rootDepth ?? DEFAULT_CANNON_CONFETTI_DEPTH,
            target: resolvedTarget,
          });
        } else {
          const colorStart = colorsAccum.length;
          colorsAccum.push(...originColors);

          const sizeStart = sizesAccum.length;
          sizesAccum.push(...originSizes);

          configs.push({
            spread: props.spread ?? DEFAULT_CANNON_CONFETTI_SPREAD_ANGLE,
            speed: props.speed ?? DEFAULT_CANNON_CONFETTI_INITIAL_SPEED,
            count: originCount,
            speedVariation: {
              min:
                props.speedVariation?.min ??
                rootSpeedVariation?.min ??
                DEFAULT_CANNON_CONFETTI_SPEED_VARIATION.min,
              max:
                props.speedVariation?.max ??
                rootSpeedVariation?.max ??
                DEFAULT_CANNON_CONFETTI_SPEED_VARIATION.max,
            },
            colorStart,
            colorCount: originColors.length,
            sizeStart,
            sizeCount: originSizes.length,
            rotation: props.rotation ?? rootRotation,
            depth: props.depth ?? rootDepth ?? DEFAULT_CANNON_CONFETTI_DEPTH,
            target: resolvedTarget,
          });
        }

        count += originCount;
      }

      return {
        cannonsPositions: positions,
        cannonConfigs: configs,
        allColors: colorsAccum,
        allSizes: sizesAccum,
        totalCount: count,
      };
    }, [
      originChildren,
      containerWidth,
      containerHeight,
      rootColors,
      rootRotation,
      rootDepth,
      rootSpeedVariation,
      rootTarget,
      hasTexture,
    ]);

  // --- Build size variations (no MIN_SIZE_VARIATIONS padding) ---
  const sizeVariations = useMemo(() => {
    return allSizes.map((size) => ({
      width: size.width,
      height: size.height,
      radius: size.radius ?? 0,
    }));
  }, [allSizes]);

  return {
    cannonsPositions,
    cannonConfigs,
    allColors,
    sizeVariations,
    totalCount,
  };
};
