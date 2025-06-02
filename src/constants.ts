import type { Rotation, DeepRequired } from './types';

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
