import { useMemo } from 'react';
import type {
  PIOriginProps,
  FlakeProps,
  FlakeStyle,
  Position,
  Range,
  Rotation,
} from '../types';
import type { PIConfig } from '../utils';
import { resolveNamedPosition } from '../utils';
import { pickChildren } from '../children';
import { Origin, Flake } from '../PIConfettiComponents';
import {
  DEFAULT_COLORS,
  DEFAULT_PI_CONFETTI_SPREAD,
  DEFAULT_PI_CONFETTI_INITIAL_SPEED,
  DEFAULT_PI_CONFETTI_SPEED_VARIATION,
  DEFAULT_PI_CONFETTI_DEPTH,
  DEFAULT_PI_ORIGIN_COUNT,
} from '../constants';
import { parseFlakeChildren, buildAtlasColors } from './useConfettiFlakes';
import type {
  SizeVariation,
  ColorRange,
  TextureInfo,
} from './useConfettiFlakes';

type UsePIOriginsParams = {
  children: React.ReactNode;
  rootColors?: string[];
  rootRotation?: Rotation;
  rootDepth?: Range;
  rootSpeedVariation?: Range;
  rootFlakeStyle?: FlakeStyle;
  containerWidth: number;
  containerHeight: number;
  parentTexture?: TextureInfo;
};

type UsePIOriginsResult = {
  blastPositions: Position[];
  originDelays: number[];
  piConfigs: PIConfig[];
  allColors: string[];
  sizeVariations: SizeVariation[];
  colorOverrides: (ColorRange | null)[];
  sizeIsTextured: boolean[];
  parentColorCount: number;
  totalCount: number;
};

export const usePIOrigins = ({
  children,
  rootColors,
  rootRotation,
  rootDepth,
  rootSpeedVariation,
  rootFlakeStyle,
  containerWidth,
  containerHeight,
  parentTexture,
}: UsePIOriginsParams): UsePIOriginsResult => {
  const { targetChildren: originChildren } = pickChildren<PIOriginProps>(
    children,
    Origin
  );

  // --- Dev-mode validations ---
  if (__DEV__) {
    if (!originChildren || originChildren.length === 0) {
      console.warn(
        'PIConfetti: at least one <PIConfetti.Origin> child is required.'
      );
    }
    if (originChildren && originChildren.length > 1) {
      const seen = new Set<string>();
      for (const o of originChildren) {
        const pos = o.props.blastPosition;
        if (typeof pos === 'string') {
          if (seen.has(pos)) {
            console.warn(
              `PIConfetti: duplicate named position "${pos}" detected. Each Origin should have a unique blastPosition.`
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
    const delays: number[] = [];
    const configs: PIConfig[] = [];
    const allSizes: SizeVariation[] = [];
    const allColorOverrides: (ColorRange | null)[] = [];
    const allSizeIsTextured: boolean[] = [];
    const allColorsAccum: string[] = [];
    let totalCount = 0;
    let globalParentColorCount = 0;

    for (const origin of origins) {
      const props = origin.props;
      positions.push(
        resolveNamedPosition(
          props.blastPosition,
          containerWidth,
          containerHeight
        )
      );
      delays.push(props.delay ?? 0);

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
      const originCount = props.count ?? DEFAULT_PI_ORIGIN_COUNT;

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

      configs.push({
        spread: props.spread ?? DEFAULT_PI_CONFETTI_SPREAD,
        initialSpeed: props.initialSpeed ?? DEFAULT_PI_CONFETTI_INITIAL_SPEED,
        count: originCount,
        speedVariation:
          props.speedVariation ??
          rootSpeedVariation ??
          DEFAULT_PI_CONFETTI_SPEED_VARIATION,
        colorStart: colorOffset,
        colorCount: originAtlasColors.length,
        sizeStart,
        sizeCount: originSizes.length,
        rotation: props.rotation ?? rootRotation,
        depth: props.depth ?? rootDepth ?? DEFAULT_PI_CONFETTI_DEPTH,
      });

      if (originParentColorCount > 0 && globalParentColorCount === 0) {
        globalParentColorCount = originParentColorCount;
      }

      totalCount += originCount;
    }

    if (allColorsAccum.length === 0) {
      allColorsAccum.push('#000');
    }

    return {
      blastPositions: positions,
      originDelays: delays,
      piConfigs: configs,
      allColors: allColorsAccum,
      sizeVariations: allSizes,
      colorOverrides: allColorOverrides,
      sizeIsTextured: allSizeIsTextured,
      parentColorCount: globalParentColorCount,
      totalCount,
    };
  }, [
    originChildren,
    containerWidth,
    containerHeight,
    rootColors,
    rootRotation,
    rootDepth,
    rootSpeedVariation,
    rootFlakeStyle,
    parentTexture,
  ]);
};
