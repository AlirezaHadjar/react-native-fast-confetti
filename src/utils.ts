import { vec } from '@shopify/react-native-skia';
import { RANDOM_INITIAL_Y_JIGGLE } from './constants';

export const getRandomBoolean = () => {
  'worklet';
  return Math.random() >= 0.5;
};

export const getRandomValue = (min: number, max: number): number => {
  'worklet';
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

export const generateBoxesArray = (
  count: number,
  colorsVariations: number,
  sizeVariations: number
) => {
  'worklet';
  return new Array(count).fill(0).map(() => ({
    clockwise: getRandomBoolean(),
    maxRotation: {
      x: getRandomValue(2 * Math.PI, 20 * Math.PI),
      z: getRandomValue(2 * Math.PI, 20 * Math.PI),
    },
    colorIndex: Math.floor(getRandomValue(0, colorsVariations - 1)),
    sizeIndex: Math.floor(getRandomValue(0, sizeVariations - 1)),
    randomXs: randomXArray(5, -50, 50), // Array of randomX values for horizontal movement
    initialRandomY: getRandomValue(
      -RANDOM_INITIAL_Y_JIGGLE,
      RANDOM_INITIAL_Y_JIGGLE
    ),
    blastThreshold: getRandomValue(0, 0.3),
    initialRotation: getRandomValue(0.1 * Math.PI, Math.PI),
    randomSpeed: getRandomValue(0.9, 1.3), // Random speed multiplier
    randomOffsetX: getRandomValue(-10, 10), // Random X offset for initial position
    randomOffsetY: getRandomValue(-10, 10), // Random Y offset for initial position
  }));
};

export const generatePIBoxesArray = (
  count: number,
  colorsVariations: number,
  sizeVariations: number
) => {
  'worklet';
  return new Array(count).fill(0).map(() => ({
    clockwise: getRandomBoolean(),
    maxRotation: {
      x: getRandomValue(1 * Math.PI, 3 * Math.PI),
      z: getRandomValue(1 * Math.PI, 3 * Math.PI),
    },
    colorIndex: Math.floor(getRandomValue(0, colorsVariations - 1)),
    sizeIndex: Math.floor(getRandomValue(0, sizeVariations - 1)),
    randomXs: randomXArray(6, -5, 5), // Array of randomX values for horizontal movement
    initialRandomY: getRandomValue(
      -RANDOM_INITIAL_Y_JIGGLE,
      RANDOM_INITIAL_Y_JIGGLE
    ),
    initialRotation: getRandomValue(0.1 * Math.PI, Math.PI),
    randomSpeed: getRandomValue(0.9, 1.3), // Random speed multiplier
    randomOffsetX: getRandomValue(-50, 50), // Random X offset for initial position
    randomOffsetY: getRandomValue(0, 150), // Random X offset for initial position
    delayBlast: getRandomValue(0, 0.6), // Random velocity multiplier
    randomAcceleration: vec(getRandomValue(0.1, 0.3), getRandomValue(0.1, 0.3)), // Random acceleration multiplier
  }));
};
