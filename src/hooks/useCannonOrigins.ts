import { useMemo } from 'react';
import type {
  CannonOriginProps,
  FlakeProps,
  FlakeStyle,
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
import type { SizeVariation, TextureInfo } from './useConfettiFlakes';

type UseCannonOriginsParams = {
  children: React.ReactNode;
  rootColors?: string[];
  rootRotation?: Rotation;
  rootDepth?: Range;
  rootSpeedVariation?: Range;
  rootTarget?: NamedPosition | Position;
  rootFlakeStyle?: FlakeStyle;
  containerWidth: number;
  containerHeight: number;
};

type UseCannonOriginsResult = {
  cannonsPositions: Position[];
  cannonConfigs: CannonConfig[];
  allColors: string[];
  sizeVariations: SizeVariation[];
  sizeColorOverrides: (number | null)[];
  hasAnyTexture: boolean;
  totalCount: number;
};

export const useCannonOrigins = ({
  children,
  rootColors,
  rootRotation,
  rootDepth,
  rootSpeedVariation,
  rootTarget,
  rootFlakeStyle,
  containerWidth,
  containerHeight,
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
  }

  return useMemo(() => {
    const origins = originChildren ?? [];
    const positions: Position[] = [];
    const configs: CannonConfig[] = [];
    const colorsAccum: string[] = [];
    const sizesAccum: SizeVariation[] = [];
    const sizeColorOverrides: (number | null)[] = [];
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
      const { targetChildren: flakeChildren } = pickChildren<FlakeProps>(
        props.children,
        Flake
      );

      // Build flake sizes for this origin with texture info
      const originFlakeStyle = props.flakeStyle ?? rootFlakeStyle ?? 'glossy';
      let originSizes: SizeVariation[];
      if (flakeChildren && flakeChildren.length > 0) {
        originSizes = flakeChildren.map((f) => {
          const fProps = f.props;
          const resolvedStyle = fProps.flakeStyle ?? originFlakeStyle;
          const w =
            'size' in fProps && fProps.size != null ? fProps.size : fProps.width;
          const h =
            'size' in fProps && fProps.size != null
              ? fProps.size
              : fProps.height;

          let texture: TextureInfo | undefined;
          if ('image' in fProps && fProps.image != null) {
            texture = { type: 'image', content: fProps.image };
          } else if ('svg' in fProps && fProps.svg != null) {
            texture = { type: 'svg', content: fProps.svg };
          }

          return {
            width: w,
            height: h,
            radius: fProps.radius ?? 0,
            flakeStyle: resolvedStyle,
            texture,
          };
        });
      } else {
        originSizes = DEFAULT_FLAKE_SIZE.map((s) => ({
          width: s.width,
          height: s.height,
          radius: s.radius ?? 0,
          flakeStyle: originFlakeStyle,
        }));
      }

      // Resolution chain: origin prop → root prop → constant default
      const originColors = props.colors ?? rootColors ?? DEFAULT_COLORS;
      const originCount = props.count ?? DEFAULT_CANNON_ORIGIN_COUNT;

      const colorStart = colorsAccum.length;
      // Only add colors if this origin has non-textured flakes
      const hasNonTextured = originSizes.some((s) => !s.texture);
      if (hasNonTextured) {
        colorsAccum.push(...originColors);
      }

      const sizeStart = sizesAccum.length;
      for (const size of originSizes) {
        sizesAccum.push(size);
        if (size.texture) {
          // Textured size gets a dedicated color row
          sizeColorOverrides.push(colorsAccum.length);
          colorsAccum.push('#000');
        } else {
          sizeColorOverrides.push(null);
        }
      }

      configs.push({
        spread: props.spread ?? DEFAULT_CANNON_CONFETTI_SPREAD_ANGLE,
        speed: props.initialSpeed ?? DEFAULT_CANNON_CONFETTI_INITIAL_SPEED,
        count: originCount,
        speedVariation:
          props.speedVariation ??
          rootSpeedVariation ??
          DEFAULT_CANNON_CONFETTI_SPEED_VARIATION,
        colorStart: hasNonTextured ? colorStart : 0,
        colorCount: hasNonTextured ? originColors.length : 1,
        sizeStart,
        sizeCount: originSizes.length,
        rotation: props.rotation ?? rootRotation,
        depth: props.depth ?? rootDepth ?? DEFAULT_CANNON_CONFETTI_DEPTH,
        target: resolvedTarget,
      });

      count += originCount;
    }

    // Ensure at least one color exists (for fully-textured setups)
    if (colorsAccum.length === 0) {
      colorsAccum.push('#000');
    }

    const hasAnyTexture = sizesAccum.some((s) => s.texture !== undefined);

    return {
      cannonsPositions: positions,
      cannonConfigs: configs,
      allColors: colorsAccum,
      sizeVariations: sizesAccum,
      sizeColorOverrides,
      hasAnyTexture,
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
    rootFlakeStyle,
  ]);
};
