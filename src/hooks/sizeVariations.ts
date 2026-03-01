import { useMemo } from 'react';
import type { ConfettiProps } from '../types';
import { getRandomValue } from '../utils';

type Strict<T> = T extends undefined ? never : T;

export const useVariations = ({
  flakeSize,
  _radiusRange,
}: {
  flakeSize: Strict<ConfettiProps['flakeSize']>;
  _radiusRange?: [number, number];
}) => {
  const DEFAULT_RADIUS_RANGE: [number, number] = [0, 0];
  const radiusRange = _radiusRange || DEFAULT_RADIUS_RANGE;

  const sizeVariations = useMemo(() => {
    const sizeVariations = [];
    for (let index = 0; index < flakeSize.length; index++) {
      const size = flakeSize[index];
      if (!size) continue;

      sizeVariations.push({
        width: size.width,
        height: size.height,
        radius:
          size.radius !== undefined
            ? size.radius
            : getRandomValue(radiusRange[0], radiusRange[1]),
      });
    }
    return sizeVariations;
  }, [flakeSize, radiusRange]);

  return sizeVariations;
};
