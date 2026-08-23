import type { SettleOnFloorConfig } from './types';
import { FLOOR_BOUNCE_DECAY } from './constants';

export type ResolvedSettleOnFloor = {
  enabled: boolean;
  restitution: number;
  friction: number;
  variation: number;
};

const DEFAULT_RESTITUTION = 0.3;
const DEFAULT_FRICTION = 0.92;

const invalidSettleOnFloor = (reason: string): never => {
  throw new Error(
    `[react-native-fast-confetti] Invalid settleOnFloor: ${reason}`
  );
};

const resolveUnitValue = (
  name: 'restitution' | 'friction' | 'variation',
  value: number | undefined,
  fallback: number
) => {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    return invalidSettleOnFloor(`${name} must be between 0 and 1.`);
  }
  return value;
};

export const resolveSettleOnFloor = (
  value: SettleOnFloorConfig | undefined
): ResolvedSettleOnFloor => {
  if (value === undefined) {
    return {
      enabled: false,
      restitution: DEFAULT_RESTITUTION,
      friction: DEFAULT_FRICTION,
      variation: 0,
    };
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return invalidSettleOnFloor('expected an object.');
  }
  if (value.enabled !== undefined && typeof value.enabled !== 'boolean') {
    return invalidSettleOnFloor('enabled must be a boolean.');
  }

  return {
    enabled: value.enabled ?? true,
    restitution: resolveUnitValue(
      'restitution',
      value.restitution,
      DEFAULT_RESTITUTION
    ),
    friction: resolveUnitValue('friction', value.friction, DEFAULT_FRICTION),
    variation: resolveUnitValue('variation', value.variation, 0),
  };
};

const MAX_IMPACT_SPEED_TO_GRAVITY_RATIO = 1.5;
const MAX_SETTLING_BOUNCES = 8;
const SETTLING_SAFETY_MARGIN_SECONDS = 0.25;

/**
 * Conservative duration for the shader's decaying bounce sequence. The
 * velocity cap bounds impact speed to 1.5 × gravity; drag and sleep make the
 * real settling time shorter.
 */
export const estimateFloorSettlingDuration = (
  floor: ResolvedSettleOnFloor
) => {
  if (!floor.enabled) return 0;
  const highestRestitution = Math.min(floor.restitution + floor.variation, 1);
  let velocityToGravityRatio = MAX_IMPACT_SPEED_TO_GRAVITY_RATIO;
  let bounceScale = 1;
  let duration = 0;
  for (let bounce = 0; bounce < MAX_SETTLING_BOUNCES; bounce++) {
    velocityToGravityRatio *= highestRestitution * bounceScale;
    duration += 2 * velocityToGravityRatio;
    bounceScale *= FLOOR_BOUNCE_DECAY;
  }
  return duration + SETTLING_SAFETY_MARGIN_SECONDS;
};
