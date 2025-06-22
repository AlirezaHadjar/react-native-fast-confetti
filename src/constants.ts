import { Easing } from 'react-native-reanimated';
import type { Rotation, DeepRequired, Range, RandomOffset } from './types';

export const DEFAULT_BOXES_COUNT = 200;

export const DEFAULT_FLAKE_SIZE = { width: 8, height: 16 };

export const DEFAULT_FALL_DURATION = 8000;

export const DEFAULT_BLAST_DURATION = 300;

export const DEFAULT_COLORS = [
  '#FF5733',
  '#33FF57',
  '#3357FF',
  '#F5FF33',
  '#FF33B5',
  '#33FFDE',
  '#FFB733',
  '#A3FF33',
  '#33A5FF',
  '#FF33A5',
];

export const DEFAULT_AUTOSTART_DELAY = 0;

export const DEFAULT_VERTICAL_SPACING = 30;

export const RANDOM_INITIAL_Y_JIGGLE = 20;

export const DEFAULT_BLAST_RADIUS = 180;

/**
 * Default rotation configuration for regular Confetti component.
 * Provides separate X and Z rotation ranges for more flexible animation control.
 */
export const DEFAULT_CONFETTI_ROTATION: DeepRequired<Rotation> = {
  x: {
    min: 2 * Math.PI,
    max: 20 * Math.PI,
  },
  z: {
    min: 2 * Math.PI,
    max: 20 * Math.PI,
  },
};

/**
 * Default rotation configuration for PIConfetti component.
 * Provides separate X and Z rotation ranges for more flexible animation control.
 */
export const DEFAULT_PICONFETTI_ROTATION: DeepRequired<Rotation> = {
  x: {
    min: 1 * Math.PI,
    max: 3 * Math.PI,
  },
  z: {
    min: 1 * Math.PI,
    max: 3 * Math.PI,
  },
};

export const DEFAULT_CONFETTI_RANDOM_SPEED: Required<Range> = {
  min: 0.9,
  max: 1.3,
};

export const DEFAULT_PICONFETTI_RANDOM_SPEED: Required<Range> = {
  min: 0.9,
  max: 1.3,
};

export const DEFAULT_CONFETTI_RANDOM_OFFSET: DeepRequired<RandomOffset> = {
  x: { min: -10, max: 10 },
  y: { min: -10, max: 10 },
};

export const DEFAULT_PICONFETTI_RANDOM_OFFSET: DeepRequired<RandomOffset> = {
  x: { min: -50, max: 50 },
  y: { min: 0, max: 150 },
};

export const CONTINUOUS_CONFETTI_RANDOM_SPEED: DeepRequired<Range> = {
  min: 1,
  max: 1,
};

export const CONTINUOUS_CONFETTI_RANDOM_OFFSET: DeepRequired<RandomOffset> = {
  x: { min: -50, max: 50 },
  y: { min: -200, max: 200 },
};

export const DEFAULT_CONFETTI_EASING = Easing.inOut(Easing.quad);
