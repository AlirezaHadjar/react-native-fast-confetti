import { useMemo } from 'react';
import type { SkImage, SkSVG } from '@shopify/react-native-skia';
import type { FlakeProps, FlakeStyle } from '../types';
import { pickChildren } from '../children';
import { Flake } from '../FlakeComponent';
import { DEFAULT_COLORS, DEFAULT_FLAKE_SIZE } from '../constants';

export type TextureInfo =
  | { type: 'image'; content: SkImage }
  | { type: 'svg'; content: SkSVG };

export type ColorRange = { start: number; count: number };

export type SizeVariation = {
  width: number;
  height: number;
  radius: number;
  flakeStyle: FlakeStyle;
  texture?: TextureInfo;
  colors?: string[];
};

export function parseFlakeChildren(
  flakeChildren: React.ReactElement<FlakeProps>[] | undefined,
  defaultFlakeStyle: FlakeStyle,
  parentTexture?: TextureInfo
): SizeVariation[] {
  if (flakeChildren && flakeChildren.length > 0) {
    return flakeChildren.map((f) => {
      const fProps = f.props;
      const resolvedStyle = fProps.flakeStyle ?? defaultFlakeStyle;
      const w =
        'size' in fProps && fProps.size != null ? fProps.size : fProps.width;
      const h =
        'size' in fProps && fProps.size != null ? fProps.size : fProps.height;

      let texture: TextureInfo | undefined;
      if ('image' in fProps && fProps.image != null) {
        texture = { type: 'image', content: fProps.image };
      } else if ('svg' in fProps && fProps.svg != null) {
        texture = { type: 'svg', content: fProps.svg };
      } else if (parentTexture) {
        texture = parentTexture;
      }

      return {
        width: w,
        height: h,
        radius: fProps.radius ?? 0,
        flakeStyle: resolvedStyle,
        texture,
        colors: fProps.colors,
      };
    });
  }
  return DEFAULT_FLAKE_SIZE.map((s) => ({
    width: s.width,
    height: s.height,
    radius: s.radius ?? 0,
    flakeStyle: defaultFlakeStyle,
    texture: parentTexture,
  }));
}

export function buildAtlasColors(
  sizes: SizeVariation[],
  parentColors: string[]
): {
  allColors: string[];
  colorOverrides: (ColorRange | null)[];
  sizeIsTextured: boolean[];
  parentColorCount: number;
} {
  const colorOverrides: (ColorRange | null)[] = new Array(sizes.length);
  const sizeIsTextured: boolean[] = new Array(sizes.length);

  const needsParentColors = sizes.some(
    (s) => !s.texture && !s.colors
  );
  const allColors: string[] = needsParentColors ? [...parentColors] : [];
  const parentColorCount = needsParentColors ? parentColors.length : 0;

  for (let i = 0; i < sizes.length; i++) {
    const size = sizes[i];
    if (size?.texture) {
      sizeIsTextured[i] = true;
      colorOverrides[i] = { start: allColors.length, count: 1 };
      allColors.push('#000');
    } else if (size?.colors && size.colors.length > 0) {
      sizeIsTextured[i] = false;
      colorOverrides[i] = { start: allColors.length, count: size.colors.length };
      allColors.push(...size.colors);
    } else {
      sizeIsTextured[i] = false;
      colorOverrides[i] = null;
    }
  }

  if (allColors.length === 0) {
    allColors.push('#000');
  }

  return { allColors, colorOverrides, sizeIsTextured, parentColorCount };
}

type UseConfettiFlakesParams = {
  children?: React.ReactNode;
  rootColors?: string[];
  rootFlakeStyle?: FlakeStyle;
  parentTexture?: TextureInfo;
};

type UseConfettiFlakesResult = {
  allColors: string[];
  sizeVariations: SizeVariation[];
  colorOverrides: (ColorRange | null)[];
  sizeIsTextured: boolean[];
  parentColorCount: number;
};

export const useConfettiFlakes = ({
  children,
  rootColors,
  rootFlakeStyle,
  parentTexture,
}: UseConfettiFlakesParams): UseConfettiFlakesResult => {
  const { targetChildren: flakeChildren } = pickChildren<FlakeProps>(
    children,
    Flake
  );

  return useMemo(() => {
    const flakeStyle = rootFlakeStyle ?? 'glossy';
    const userColors = rootColors ?? DEFAULT_COLORS;
    const sizes = parseFlakeChildren(flakeChildren, flakeStyle, parentTexture);
    const { allColors, colorOverrides, sizeIsTextured, parentColorCount } =
      buildAtlasColors(sizes, userColors);

    return {
      allColors,
      sizeVariations: sizes,
      colorOverrides,
      sizeIsTextured,
      parentColorCount,
    };
  }, [flakeChildren, rootColors, rootFlakeStyle, parentTexture]);
};
