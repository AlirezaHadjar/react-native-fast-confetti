import { d, std, tgpu } from 'typegpu';

import { quaternionConjugate, rotateByQuaternion } from '../gpuMath';
import { computeWindField } from './turbulence';

/**
 * Preserves the shipped body-frame drag model while giving every stateful mode
 * one implementation. A later physics ADR may change its coefficients/axes,
 * but extraction itself must remain behavior-neutral.
 */
export const computeBodyFrameDrag = tgpu.fn(
  [d.vec4f, d.vec3f, d.f32, d.f32],
  d.vec3f
)((orientation, velocity, normalDrag, tangentialDrag) => {
  'use gpu';

  const bodyVelocity = rotateByQuaternion(
    quaternionConjugate(orientation),
    velocity
  );
  const bodyForce = d.vec3f(
    -normalDrag * bodyVelocity.x * std.abs(bodyVelocity.x),
    -normalDrag * bodyVelocity.y * std.abs(bodyVelocity.y),
    -tangentialDrag * bodyVelocity.z * std.abs(bodyVelocity.z)
  );
  return rotateByQuaternion(orientation, bodyForce);
});

/** Complete airborne acceleration shared by stateful particle modes. */
export const computeAirborneAcceleration = tgpu.fn(
  [
    d.vec3f,
    d.vec4f,
    d.vec3f,
    d.vec3f,
    d.vec4f,
    d.vec3f,
    d.f32,
    d.f32,
    d.f32,
  ],
  d.vec3f
)(
  (
    position,
    orientation,
    velocity,
    angularVelocity,
    drag,
    gravity,
    windStrength,
    magnusStrength,
    time
  ) => {
    'use gpu';

    const dragForce = computeBodyFrameDrag(
      orientation,
      velocity,
      drag.x,
      drag.y
    );
    let magnusForce = d.vec3f(0);
    if (magnusStrength > 0.001) {
      magnusForce =
        drag.w * magnusStrength * std.cross(angularVelocity, velocity);
    }
    let windForce = d.vec3f(0);
    if (windStrength > 0.001) {
      windForce = computeWindField(position, time) * windStrength;
    }
    return gravity + dragForce + magnusForce + windForce;
  }
);

/** Shipped angular drive/damping model, extracted without coefficient changes. */
export const integrateAngularVelocity = tgpu.fn(
  [d.vec3f, d.vec3f, d.f32, d.f32, d.f32],
  d.vec3f
)((initial, current, rotationalDrag, drive, dt) => {
  'use gpu';

  const initialLength = std.length(initial);
  const tumbleAxis = std.select(
    d.vec3f(1, 0, 0),
    initial / std.max(initialLength, 0.0001),
    initialLength > 0.0001
  );
  const tumbleBias =
    tumbleAxis * initialLength * initialLength * rotationalDrag * drive;
  const damping = -rotationalDrag * current * std.length(current);
  let next = current + (tumbleBias + damping) * dt;
  const maximum = std.max(initialLength * 1.5, 25);
  const magnitudeSquared = std.dot(next, next);
  if (magnitudeSquared > maximum * maximum) {
    next = next * (maximum * std.inverseSqrt(magnitudeSquared));
  }
  return d.vec3f(next);
});
