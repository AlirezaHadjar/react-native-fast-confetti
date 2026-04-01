import { Easing } from 'react-native-reanimated';
import type {
  Rotation,
  Range,
  FlakeSize,
} from './types';

export const DEFAULT_BOXES_COUNT = 200;

export const DEFAULT_FLAKE_SIZE: FlakeSize[] = [
  { width: 8, height: 16, radius: undefined },
];

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

export const DEFAULT_VERTICAL_SPACING = 70;

export const RANDOM_INITIAL_Y_JIGGLE = 60;

/**
 * Default rotation configuration for regular Confetti component.
 * Provides separate X and Z rotation ranges for more flexible animation control.
 */
export const DEFAULT_CONFETTI_ROTATION: Required<Rotation> = {
  x: {
    min: 2 * Math.PI,
    max: 20 * Math.PI,
  },
  z: {
    min: 2 * Math.PI,
    max: 20 * Math.PI,
  },
};

export const DEFAULT_CONFETTI_GRAVITY = 1.0;
export const DEFAULT_CONFETTI_DEPTH: Required<Range> = { min: 0.8, max: 1.0 };
export const DEFAULT_CONFETTI_WOBBLE: Required<Range> = {
  min: 0.03,
  max: 0.08,
};

export const DEFAULT_CONFETTI_DRIFT = 0.7;

/** Gentle ease-in: slow start that transitions into steady falling. */
export const DEFAULT_CONFETTI_FALL_EASING = Easing.bezier(0.4, 0, 1, 1);
export const TRAJECTORY_SAMPLE_COUNT = 120;
export const DEFAULT_TANGENTIAL_DRAG_RATIO = 0.25;
export const DEFAULT_ROTATIONAL_DAMPING = 2.0;

/**
 * Maximum ratio of the offscreen spawn grid height to the container height.
 * Prevents the grid from growing disproportionately large for small containers.
 */
export const MAX_GRID_HEIGHT_RATIO = 1.5;

/**
 * Base safety multiplier for the wobble margin in duration estimation.
 * Accounts for the ODE's coupling term dissipating translational energy
 * into rotation, which lowers effective terminal velocity.
 */
export const WOBBLE_MARGIN_BASE = 1.2;

/**
 * Per-unit wobble scaling factor for the duration margin.
 */
export const WOBBLE_MARGIN_PER_UNIT = 0.5;

/**
 * Fallback wobble value used when maxWobble is not provided.
 */
export const WOBBLE_MARGIN_FALLBACK = 1.5;

export const DEFAULT_CANNON_ORIGIN_COUNT = 100;
export const DEFAULT_CANNON_CONFETTI_GRAVITY = 3.0;
export const DEFAULT_CANNON_CONFETTI_DRAG = 3.0;
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

export const DEFAULT_CANNON_CONFETTI_ROTATION: Required<Rotation> = {
  x: {
    min: 2 * Math.PI,
    max: 10 * Math.PI,
  },
  z: {
    min: 2 * Math.PI,
    max: 10 * Math.PI,
  },
};

export const DEFAULT_PI_ORIGIN_COUNT = 100;
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
export const DEFAULT_PI_CONFETTI_ROTATION: Required<Rotation> = {
  x: {
    min: 2 * Math.PI,
    max: 10 * Math.PI,
  },
  z: {
    min: 2 * Math.PI,
    max: 10 * Math.PI,
  },
};
