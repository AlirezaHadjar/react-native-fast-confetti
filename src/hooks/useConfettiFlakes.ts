import { useMemo } from 'react';
import type { SkImage, SkSVG } from '@shopify/react-native-skia';
import type { FlakeProps, FlakeStyle } from '../types';
import { pickChildren } from '../children';
import { Flake } from '../FlakeComponent';
import { DEFAULT_COLORS, DEFAULT_FLAKE_SIZE } from '../constants';

export type TextureInfo =
  | { type: 'image'; content: SkImage }
  | { type: 'svg'; content: SkSVG };

export type SizeVariation = {
  width: number;
  height: number;
  radius: number;
  flakeStyle: FlakeStyle;
  texture?: TextureInfo;
};

type UseConfettiFlakesParams = {
  children?: React.ReactNode;
  rootColors?: string[];
  rootFlakeStyle?: FlakeStyle;
};

type UseConfettiFlakesResult = {
  allColors: string[];
  sizeVariations: SizeVariation[];
  /** For each sizeIndex, the locked colorIndex if textured, or null for random color. */
  sizeColorOverrides: (number | null)[];
  hasAnyTexture: boolean;
};

export const useConfettiFlakes = ({
  children,
  rootColors,
  rootFlakeStyle,
}: UseConfettiFlakesParams): UseConfettiFlakesResult => {
  const { targetChildren: flakeChildren } = pickChildren<FlakeProps>(
    children,
    Flake
  );

  return useMemo(() => {
    const flakeStyle = rootFlakeStyle ?? 'glossy';
    const userColors = rootColors ?? DEFAULT_COLORS;

    // Parse Flake children into size variations with texture info
    let sizes: SizeVariation[];
    if (flakeChildren && flakeChildren.length > 0) {
      sizes = flakeChildren.map((f) => {
        const fProps = f.props;
        const resolvedStyle = fProps.flakeStyle ?? flakeStyle;
        const w =
          'size' in fProps && fProps.size != null ? fProps.size : fProps.width;
        const h =
          'size' in fProps && fProps.size != null ? fProps.size : fProps.height;

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
      sizes = DEFAULT_FLAKE_SIZE.map((s) => ({
        width: s.width,
        height: s.height,
        radius: s.radius ?? 0,
        flakeStyle: flakeStyle,
      }));
    }

    // Build colors array: user colors for non-textured flakes,
    // plus one '#000' placeholder per unique textured size variant.
    const hasAnyTexture = sizes.some((s) => s.texture !== undefined);
    const allNonTextured = sizes.every((s) => s.texture === undefined);

    let allColors: string[];
    const sizeColorOverrides: (number | null)[] = new Array(sizes.length);

    if (allNonTextured) {
      // No textures at all — standard behavior
      allColors = userColors;
      sizeColorOverrides.fill(null);
    } else {
      // Mixed or all-textured: user colors + texture placeholder rows
      allColors = [...userColors];
      for (let i = 0; i < sizes.length; i++) {
        if (sizes[i]!.texture) {
          // Each textured size gets a dedicated color row
          sizeColorOverrides[i] = allColors.length;
          allColors.push('#000');
        } else {
          sizeColorOverrides[i] = null;
        }
      }
    }

    return {
      allColors,
      sizeVariations: sizes,
      sizeColorOverrides,
      hasAnyTexture,
    };
  }, [flakeChildren, rootColors, rootFlakeStyle]);
};
