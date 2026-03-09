import { Easing } from 'react-native-reanimated';
import type {
  Rotation,
  DeepRequired,
  Range,
  RandomOffset,
  FlakeSize,
} from './types';

export const DEFAULT_BOXES_COUNT = 200;

export const DEFAULT_FLAKE_SIZE: FlakeSize[] = [
  { width: 8, height: 16, radius: undefined },
];

export const DEFAULT_FALL_DURATION = 8000;

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

export const DEFAULT_CONFETTI_RANDOM_SPEED: Required<Range> = {
  min: 0.9,
  max: 1.3,
};

export const DEFAULT_CONFETTI_RANDOM_OFFSET: DeepRequired<RandomOffset> = {
  x: { min: -10, max: 10 },
  y: { min: -10, max: 10 },
};

export const CONTINUOUS_CONFETTI_RANDOM_SPEED: DeepRequired<Range> = {
  min: 1,
  max: 1,
};

export const CONTINUOUS_CONFETTI_RANDOM_OFFSET: DeepRequired<RandomOffset> = {
  x: { min: -50, max: 50 },
  y: { min: -200, max: 200 },
};

export const DEFAULT_CONFETTI_FALL_EASING = Easing.inOut(Easing.quad);

export const DEFAULT_CONFETTI_BLAST_EASING = Easing.inOut(Easing.quad);

export const DEFAULT_CONFETTI_GRAVITY = 1.0;
export const DEFAULT_CONFETTI_DEPTH: Required<Range> = { min: 0.8, max: 1.0 };
export const DEFAULT_CONFETTI_FLUTTER: Required<Range> = {
  min: 0.03,
  max: 0.08,
};

export const DEFAULT_CONFETTI_DRIFT = 0.5;
export const TRAJECTORY_SAMPLE_COUNT = 120;
export const DEFAULT_TANGENTIAL_DRAG_RATIO = 0.25;
export const DEFAULT_ROTATIONAL_DAMPING = 2.0;

export const DEFAULT_CANNON_ORIGIN_COUNT = 100;
export const DEFAULT_CANNON_CONFETTI_GRAVITY = 3.0;
export const DEFAULT_CANNON_CONFETTI_DRAG = 2.0;
export const DEFAULT_CANNON_CONFETTI_INITIAL_SPEED = 2.0;
export const DEFAULT_CANNON_CONFETTI_SPREAD_ANGLE = Math.PI / 5;
export const DEFAULT_CANNON_CONFETTI_SPEED_VARIATION: Required<Range> = {
  min: 0.8,
  max: 1.2,
};
export const DEFAULT_CANNON_CONFETTI_LAUNCH_DELAY_MAX = 0.2;

export const DEFAULT_CANNON_CONFETTI_DEPTH: Required<Range> = {
  min: 1,
  max: 1.1,
};

export const DEFAULT_CANNON_CONFETTI_ROTATION: DeepRequired<Rotation> = {
  x: {
    min: 2 * Math.PI,
    max: 10 * Math.PI,
  },
  z: {
    min: 2 * Math.PI,
    max: 10 * Math.PI,
  },
};

export const DEFAULT_PI_CONFETTI_GRAVITY = 3.0;
export const DEFAULT_PI_CONFETTI_DRAG = 3.0;
export const DEFAULT_PI_CONFETTI_INITIAL_SPEED = 1.0;
export const DEFAULT_PI_CONFETTI_SPREAD = 2 * Math.PI;
export const DEFAULT_PI_CONFETTI_SPEED_VARIATION: Required<Range> = {
  min: 0.0,
  max: 1.0,
};
export const DEFAULT_PI_CONFETTI_LAUNCH_DELAY_MAX = 0.15;
export const DEFAULT_PI_CONFETTI_DEPTH: Required<Range> = {
  min: 1,
  max: 1.1,
};
export const DEFAULT_PI_CONFETTI_ROTATION: DeepRequired<Rotation> = {
  x: {
    min: 2 * Math.PI,
    max: 10 * Math.PI,
  },
  z: {
    min: 2 * Math.PI,
    max: 10 * Math.PI,
  },
};
