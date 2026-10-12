import { d, std, tgpu } from 'typegpu';

import {
  FLOOR_CONTACT_SPIN_COUPLING,
  FLOOR_MAX_CONTACT_ANGULAR_SPEED,
  FLOOR_SLEEP_ANGULAR_SPEED,
  FLOOR_SLEEP_LINEAR_SPEED,
  FLOOR_SLEEP_STABLE_SECONDS,
} from '../../constants';

const FloorContactResultSchema = d.struct({
  velocity: d.vec3f,
  angularVelocity: d.vec3f,
});

/** Applies floor friction and converts bounded tangential impulse into spin. */
export const applyFloorContactFriction = tgpu.fn(
  [d.vec3f, d.vec3f, d.f32],
  FloorContactResultSchema
)((velocity, angularVelocity, tangentialRetention) => {
  'use gpu';

  const retention = std.clamp(tangentialRetention, 0, 1);
  const retainedVelocity = d.vec3f(
    velocity.x * retention,
    velocity.y,
    velocity.z * retention
  );
  const contactSpin =
    d.vec3f(-velocity.z, 0, velocity.x) *
    ((1 - retention) * FLOOR_CONTACT_SPIN_COUPLING);
  let nextAngularVelocity = angularVelocity * retention + contactSpin;
  const angularSpeed = std.length(nextAngularVelocity);
  if (angularSpeed > FLOOR_MAX_CONTACT_ANGULAR_SPEED) {
    nextAngularVelocity =
      nextAngularVelocity * (FLOOR_MAX_CONTACT_ANGULAR_SPEED / angularSpeed);
  }

  return FloorContactResultSchema({
    velocity: retainedVelocity,
    angularVelocity: nextAngularVelocity,
  });
});

/** Accumulates only continuous low-motion floor time. */
export const updateFloorSleepTime = tgpu.fn(
  [d.f32, d.vec3f, d.vec3f, d.f32],
  d.f32
)((previousTime, velocity, angularVelocity, dt) => {
  'use gpu';

  if (
    std.length(velocity) > FLOOR_SLEEP_LINEAR_SPEED ||
    std.length(angularVelocity) > FLOOR_SLEEP_ANGULAR_SPEED
  ) {
    return d.f32(0);
  }
  return std.min(previousTime + dt, FLOOR_SLEEP_STABLE_SECONDS);
});
