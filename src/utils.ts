import { vec, type SkImage, type SkSVG } from '@shopify/react-native-skia';
import {
  RANDOM_INITIAL_Y_JIGGLE,
  DEFAULT_CONFETTI_ROTATION,
  DEFAULT_PICONFETTI_ROTATION,
  DEFAULT_CONFETTI_RANDOM_SPEED,
  DEFAULT_CONFETTI_RANDOM_OFFSET,
  DEFAULT_PICONFETTI_RANDOM_OFFSET,
  DEFAULT_PICONFETTI_RANDOM_SPEED,
} from './constants';
import { Extrapolation, interpolate } from 'react-native-reanimated';
import type { RandomOffset, Range, Rotation } from './types';

export const getRandomBoolean = () => {
  'worklet';
  return Math.random() >= 0.5;
};

export const getRandomValue = (min: number, max: number): number => {
  'worklet';
  if (min === max) return min;
  return Math.random() * (max - min) + min;
};

export const randomColor = (colors: string[]): string => {
  'worklet';
  return colors[Math.floor(Math.random() * colors.length)] as string;
};

export const randomXArray = (num: number, min: number, max: number) => {
  'worklet';
  return new Array(num).fill(0).map(() => getRandomValue(min, max));
};

export const generateEvenlyDistributedValues = (
  lowerBound: number,
  upperBound: number,
  chunks: number
) => {
  'worklet';
  const step = (upperBound - lowerBound) / (chunks - 1);
  return Array.from({ length: chunks }, (_, i) => lowerBound + step * i);
};

const resolveRange = (
  range?: { min?: number; max?: number },
  defaultRange?: { min: number; max: number }
) => {
  'worklet';
  const finalMin = range?.min ?? defaultRange?.min ?? 0;
  const finalMax = range?.max ?? defaultRange?.max ?? 0;
  return { min: finalMin, max: finalMax };
};

export const generateBoxesArray = ({
  colorsVariations,
  count,
  duration,
  sizeVariations,
  rotation = DEFAULT_CONFETTI_ROTATION,
  randomSpeed = DEFAULT_CONFETTI_RANDOM_SPEED,
  randomOffset = DEFAULT_CONFETTI_RANDOM_OFFSET,
}: {
  count: number;
  colorsVariations: number;
  sizeVariations: number;
  duration: number;
  rotation?: Rotation;
  randomSpeed?: Range;
  randomOffset?: RandomOffset;
}) => {
  'worklet';

  const xRotationRange = resolveRange(rotation.x, DEFAULT_CONFETTI_ROTATION.x);
  const zRotationRange = resolveRange(rotation.z, DEFAULT_CONFETTI_ROTATION.z);
  const randomSpeedRange = resolveRange(
    randomSpeed,
    DEFAULT_CONFETTI_RANDOM_SPEED
  );
  const randomXOffsetRange = resolveRange(
    randomOffset.x,
    DEFAULT_CONFETTI_RANDOM_OFFSET.x
  );
  const randomYOffsetRange = resolveRange(
    randomOffset.y,
    DEFAULT_CONFETTI_RANDOM_OFFSET.y
  );

  const maxRandomX = interpolate(
    duration,
    [0, 8000],
    [5, 50],
    Extrapolation.CLAMP
  );

  return new Array(count).fill(0).map(() => ({
    clockwise: getRandomBoolean(),
    maxRotation: {
      x: getRandomValue(xRotationRange.min, xRotationRange.max),
      z: getRandomValue(zRotationRange.min, zRotationRange.max),
    },
    colorIndex: Math.round(getRandomValue(0, colorsVariations - 1)),
    sizeIndex: Math.round(getRandomValue(0, sizeVariations - 1)),
    randomXs: randomXArray(5, -maxRandomX, maxRandomX), // Array of randomX values for horizontal movement
    initialRandomY: getRandomValue(
      -RANDOM_INITIAL_Y_JIGGLE,
      RANDOM_INITIAL_Y_JIGGLE
    ),
    blastThreshold: getRandomValue(0, 0.3),
    initialRotation: getRandomValue(0.1 * Math.PI, Math.PI),
    randomSpeed: getRandomValue(randomSpeedRange.min, randomSpeedRange.max), // Random speed multiplier
    randomOffsetX: getRandomValue(
      randomXOffsetRange.min,
      randomXOffsetRange.max
    ), // Random X offset for initial position
    randomOffsetY: getRandomValue(
      randomYOffsetRange.min,
      randomYOffsetRange.max
    ), // Random Y offset for initial position
  }));
};

export const generatePIBoxesArray = ({
  count,
  colorsVariations,
  sizeVariations,
  rotation = DEFAULT_PICONFETTI_ROTATION,
  randomSpeed = DEFAULT_PICONFETTI_RANDOM_SPEED,
  randomOffset = DEFAULT_PICONFETTI_RANDOM_OFFSET,
}: {
  count: number;
  colorsVariations: number;
  sizeVariations: number;
  rotation?: Rotation;
  randomSpeed?: Range;
  randomOffset?: RandomOffset;
}) => {
  'worklet';

  const xRotationRange = resolveRange(
    rotation.x,
    DEFAULT_PICONFETTI_ROTATION.x
  );
  const zRotationRange = resolveRange(
    rotation.z,
    DEFAULT_PICONFETTI_ROTATION.z
  );
  const randomSpeedRange = resolveRange(
    randomSpeed,
    DEFAULT_PICONFETTI_RANDOM_SPEED
  );
  const randomXOffsetRange = resolveRange(
    randomOffset.x,
    DEFAULT_PICONFETTI_RANDOM_OFFSET.x
  );
  const randomYOffsetRange = resolveRange(
    randomOffset.y,
    DEFAULT_PICONFETTI_RANDOM_OFFSET.y
  );

  return new Array(count).fill(0).map(() => ({
    clockwise: getRandomBoolean(),
    maxRotation: {
      x: getRandomValue(xRotationRange.min, xRotationRange.max),
      z: getRandomValue(zRotationRange.min, zRotationRange.max),
    },
    colorIndex: Math.round(getRandomValue(0, colorsVariations - 1)),
    sizeIndex: Math.round(getRandomValue(0, sizeVariations - 1)),
    randomXs: randomXArray(6, -5, 5), // Array of randomX values for horizontal movement
    initialRandomY: getRandomValue(
      -RANDOM_INITIAL_Y_JIGGLE,
      RANDOM_INITIAL_Y_JIGGLE
    ),
    initialRotation: getRandomValue(0.1 * Math.PI, Math.PI),
    randomSpeed: getRandomValue(randomSpeedRange.min, randomSpeedRange.max), // Random speed multiplier
    randomOffsetX: getRandomValue(
      randomXOffsetRange.min,
      randomXOffsetRange.max
    ), // Random X offset for initial position
    randomOffsetY: getRandomValue(
      randomYOffsetRange.min,
      randomYOffsetRange.max
    ), // Random X offset for initial position
    delayBlast: getRandomValue(0, 0.6), // Random velocity multiplier
    randomAcceleration: vec(getRandomValue(0.1, 0.3), getRandomValue(0.1, 0.3)), // Random acceleration multiplier
  }));
};

export const createTextureProps = <T extends 'svg' | 'image'>(
  type: T,
  content: any
) =>
  ({ type, content }) as T extends 'svg'
    ? { type: 'svg'; content: SkSVG }
    : { type: 'image'; content: SkImage };
