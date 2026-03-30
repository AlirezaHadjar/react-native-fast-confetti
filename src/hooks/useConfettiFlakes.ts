import { useMemo } from 'react';
import type { FlakeProps, FlakeSize, FlakeStyle } from '../types';
import { pickChildren } from '../children';
import { Flake } from '../FlakeComponent';
import { DEFAULT_COLORS, DEFAULT_FLAKE_SIZE } from '../constants';

type UseConfettiFlakesParams = {
  children?: React.ReactNode;
  rootColors?: string[];
  rootFlakeStyle?: FlakeStyle;
  hasTexture: boolean;
};

type UseConfettiFlakesResult = {
  allColors: string[];
  sizeVariations: {
    width: number;
    height: number;
    radius: number;
    flakeStyle: FlakeStyle;
  }[];
};

export const useConfettiFlakes = ({
  children,
  rootColors,
  rootFlakeStyle,
  hasTexture,
}: UseConfettiFlakesParams): UseConfettiFlakesResult => {
  const { targetChildren: flakeChildren } = pickChildren<FlakeProps>(
    children,
    Flake
  );

  const { allColors, allSizes } = useMemo(() => {
    const flakeStyle = rootFlakeStyle ?? 'glossy';

    let sizes: (FlakeSize & { flakeStyle: FlakeStyle })[];
    if (flakeChildren && flakeChildren.length > 0) {
      sizes = flakeChildren.map((f) => {
        const fProps = f.props;
        const resolvedStyle = fProps.flakeStyle ?? flakeStyle;
        if ('size' in fProps && fProps.size != null) {
          return {
            width: fProps.size,
            height: fProps.size,
            radius: fProps.radius,
            flakeStyle: resolvedStyle,
          };
        }
        return {
          width: fProps.width,
          height: fProps.height,
          radius: fProps.radius,
          flakeStyle: resolvedStyle,
        };
      });
    } else {
      sizes = DEFAULT_FLAKE_SIZE.map((s) => ({
        ...s,
        flakeStyle: flakeStyle,
      }));
    }

    const colors = rootColors ?? DEFAULT_COLORS;

    if (hasTexture) {
      return {
        allColors: ['#000'],
        allSizes: sizes,
      };
    }

    return {
      allColors: colors,
      allSizes: sizes,
    };
  }, [flakeChildren, rootColors, rootFlakeStyle, hasTexture]);

  const sizeVariations = useMemo(() => {
    return allSizes.map((size) => ({
      width: size.width,
      height: size.height,
      radius: size.radius ?? 0,
      flakeStyle: size.flakeStyle,
    }));
  }, [allSizes]);

  return {
    allColors,
    sizeVariations,
  };
};
