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
import {
  reduceCountForMotion,
  scaleRotationForMotion,
  scaleValueForMotion,
} from '../reducedMotion';
import { pickChildren } from '../children';
import { Origin, Flake } from '../CannonConfettiComponents';
import {
  DEFAULT_COLORS,
  DEFAULT_CANNON_CONFETTI_SPREAD_ANGLE,
  DEFAULT_CANNON_CONFETTI_INITIAL_SPEED,
  DEFAULT_CANNON_CONFETTI_SPEED_VARIATION,
  DEFAULT_CANNON_CONFETTI_DEPTH,
  DEFAULT_CANNON_CONFETTI_ROTATION,
  DEFAULT_CANNON_ORIGIN_COUNT,
} from '../constants';
import { parseFlakeChildren, buildAtlasColors } from './useConfettiFlakes';
import type {
  SizeVariation,
  ColorRange,
  TextureInfo,
} from './useConfettiFlakes';

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
  parentTexture?: TextureInfo;
  reducedMotionFactor: number;
};

type UseCannonOriginsResult = {
  cannonsPositions: Position[];
  cannonConfigs: CannonConfig[];
  durationCannonConfigs: CannonConfig[];
  allColors: string[];
  sizeVariations: SizeVariation[];
  colorOverrides: (ColorRange | null)[];
  sizeIsTextured: boolean[];
  parentColorCount: number;
  totalCount: number;
  visibleCount: number;
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
  parentTexture,
  reducedMotionFactor,
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
    const durationConfigs: CannonConfig[] = [];
    const allSizes: SizeVariation[] = [];
    const allColorOverrides: (ColorRange | null)[] = [];
    const allSizeIsTextured: boolean[] = [];
    const allColorsAccum: string[] = [];
    let totalCount = 0;
    let visibleCount = 0;
    let globalParentColorCount = 0;

    for (const origin of origins) {
      const props = origin.props;
      positions.push(
        resolveNamedPosition(props.position, containerWidth, containerHeight)
      );

      const resolvedTarget =
        props.target != null
          ? resolveNamedPosition(props.target, containerWidth, containerHeight)
          : rootTarget != null
            ? resolveNamedPosition(rootTarget, containerWidth, containerHeight)
            : { x: containerWidth / 2, y: 0 };

      const { targetChildren: flakeChildren } = pickChildren<FlakeProps>(
        props.children,
        Flake
      );

      const originFlakeStyle = props.flakeStyle ?? rootFlakeStyle ?? 'glossy';
      const originSizes = parseFlakeChildren(
        flakeChildren,
        originFlakeStyle,
        parentTexture
      );
      const originColors = props.colors ?? rootColors ?? DEFAULT_COLORS;
      const fullMotionCount = props.count ?? DEFAULT_CANNON_ORIGIN_COUNT;
      const spread = props.spread ?? DEFAULT_CANNON_CONFETTI_SPREAD_ANGLE;
      const speed =
        props.initialSpeed ?? DEFAULT_CANNON_CONFETTI_INITIAL_SPEED;
      const speedVariation =
        props.speedVariation ??
        rootSpeedVariation ??
        DEFAULT_CANNON_CONFETTI_SPEED_VARIATION;
      const rotation =
        props.rotation ?? rootRotation ?? DEFAULT_CANNON_CONFETTI_ROTATION;
      const depth = props.depth ?? rootDepth ?? DEFAULT_CANNON_CONFETTI_DEPTH;
      const originCount = reduceCountForMotion(
        fullMotionCount,
        reducedMotionFactor
      );

      // Build atlas colors for this origin's flakes
      const {
        allColors: originAtlasColors,
        colorOverrides: originColorOverrides,
        sizeIsTextured: originSizeIsTextured,
        parentColorCount: originParentColorCount,
      } = buildAtlasColors(originSizes, originColors);

      // Offset all color ranges to account for previously accumulated colors
      const colorOffset = allColorsAccum.length;
      const sizeStart = allSizes.length;

      for (let i = 0; i < originSizes.length; i++) {
        allSizes.push(originSizes[i]!);
        allSizeIsTextured.push(originSizeIsTextured[i] ?? false);
        const override = originColorOverrides[i];
        if (override) {
          allColorOverrides.push({
            start: override.start + colorOffset,
            count: override.count,
          });
        } else {
          // Default colors: offset the parent color range
          allColorOverrides.push(
            originParentColorCount > 0
              ? { start: colorOffset, count: originParentColorCount }
              : null
          );
        }
      }

      allColorsAccum.push(...originAtlasColors);

      const durationConfig: CannonConfig = {
        spread,
        speed,
        count: fullMotionCount,
        speedVariation,
        colorStart: colorOffset,
        colorCount: originAtlasColors.length,
        sizeStart,
        sizeCount: originSizes.length,
        rotation,
        depth,
        target: resolvedTarget,
      };

      durationConfigs.push(durationConfig);
      configs.push({
        ...durationConfig,
        spread: scaleValueForMotion(spread, reducedMotionFactor),
        count: fullMotionCount,
        rotation: scaleRotationForMotion(rotation, reducedMotionFactor),
      });

      if (originParentColorCount > 0 && globalParentColorCount === 0) {
        globalParentColorCount = originParentColorCount;
      }

      totalCount += fullMotionCount;
      visibleCount += originCount;
    }

    if (allColorsAccum.length === 0) {
      allColorsAccum.push('#000');
    }

    return {
      cannonsPositions: positions,
      cannonConfigs: configs,
      durationCannonConfigs: durationConfigs,
      allColors: allColorsAccum,
      sizeVariations: allSizes,
      colorOverrides: allColorOverrides,
      sizeIsTextured: allSizeIsTextured,
      parentColorCount: globalParentColorCount,
      totalCount,
      visibleCount,
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
    parentTexture,
    reducedMotionFactor,
  ]);
};
