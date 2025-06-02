import { useMemo } from 'react';
import type { ConfettiProps } from '../types';
import { getRandomValue } from '../utils';

type Strict<T> = T extends undefined ? never : T;

export const useVariations = ({
  sizeVariation,
  flakeSize,
  _radiusRange,
}: {
  sizeVariation: Strict<ConfettiProps['sizeVariation']>;
  flakeSize: Strict<ConfettiProps['flakeSize']>;
  _radiusRange?: [number, number];
}) => {
  const DEFAULT_RADIUS_RANGE: [number, number] = [0, 0];
  const radiusRange = _radiusRange || DEFAULT_RADIUS_RANGE;

  const sizeSteps = 10;
  const sizeVariations = useMemo(() => {
    const sizeVariations = [];
    // Nested loops to create all possible width-height combinations
    for (let i = 0; i < sizeSteps; i++) {
      for (let j = 0; j < sizeSteps; j++) {
        // Using quadratic curve to skew distribution towards larger sizes
        // Math.pow(x, 2) creates a curve that produces more values closer to 0
        const widthScale = -Math.pow(i / (sizeSteps - 1), 2);
        const heightScale = -Math.pow(j / (sizeSteps - 1), 2);
        const widthMultiplier = 1 + sizeVariation * widthScale;
        const heightMultiplier = 1 + sizeVariation * heightScale;

        sizeVariations.push({
          width: flakeSize.width * widthMultiplier,
          height: flakeSize.height * heightMultiplier,
          radius: getRandomValue(radiusRange[0], radiusRange[1]),
        });
      }
    }
    return sizeVariations;
  }, [sizeSteps, sizeVariation, flakeSize, radiusRange]);

  return sizeVariations;
};
