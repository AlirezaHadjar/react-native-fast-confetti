import { d, std, tgpu } from 'typegpu';

import { quaternionConjugate, rotateByQuaternion } from '../gpuMath';
import { computeWindField } from './turbulence';

/** Applies stronger quadratic drag along local Z, the plate normal. */
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
    -tangentialDrag * bodyVelocity.x * std.abs(bodyVelocity.x),
    -tangentialDrag * bodyVelocity.y * std.abs(bodyVelocity.y),
    -normalDrag * bodyVelocity.z * std.abs(bodyVelocity.z)
  );
  return rotateByQuaternion(orientation, bodyForce);
});

/** Particle velocity relative to the local coherent wind field. */
export const computeRelativeAirVelocity = tgpu.fn(
  [d.vec3f, d.vec3f, d.f32, d.f32],
  d.vec3f
)((position, velocity, windStrength, time) => {
  'use gpu';

  let windVelocity = d.vec3f(0);
  if (windStrength > 0.001) {
    windVelocity = computeWindField(position, time) * windStrength;
  }
  return d.vec3f(velocity - windVelocity);
});

/** Complete airborne acceleration shared by stateful particle modes. */
export const computeAirborneAcceleration = tgpu.fn(
  [d.vec4f, d.vec3f, d.vec3f, d.vec4f, d.vec3f, d.f32],
  d.vec3f
)((
  orientation,
  relativeAirVelocity,
  angularVelocity,
  drag,
  gravity,
  magnusStrength
) => {
  'use gpu';

  const dragForce = computeBodyFrameDrag(
    orientation,
    relativeAirVelocity,
    drag.x,
    drag.y
  );
  let magnusForce = d.vec3f(0);
  if (magnusStrength > 0.001) {
    magnusForce =
      drag.w * magnusStrength * std.cross(angularVelocity, relativeAirVelocity);
  }
  return gravity + dragForce + magnusForce;
});

/** Airflow torque tends to turn the plate edge-on to relative motion. */
export const computeAerodynamicTorque = tgpu.fn(
  [d.vec4f, d.vec3f, d.f32, d.f32],
  d.vec3f
)((orientation, relativeAirVelocity, torqueScale, drive) => {
  'use gpu';

  const speed = std.length(relativeAirVelocity);
  if (speed <= 0.001) return d.vec3f(0);

  const airflowDirection = relativeAirVelocity / speed;
  const plateNormal = rotateByQuaternion(orientation, d.vec3f(0, 0, 1));
  const alignment = std.dot(plateNormal, airflowDirection);
  const speedFactor = std.clamp(speed * 0.002, 0, 1);
  return d.vec3f(
    std.cross(airflowDirection, plateNormal) *
      (alignment * torqueScale * drive * speedFactor)
  );
});

/** Integrates seeded tumble, airflow torque, and angular damping. */
export const integrateAngularVelocity = tgpu.fn(
  [d.vec3f, d.vec3f, d.vec4f, d.vec3f, d.f32, d.f32, d.f32],
  d.vec3f
)((
  initial,
  current,
  orientation,
  relativeAirVelocity,
  rotationalDrag,
  drive,
  dt
) => {
  'use gpu';

  const initialLength = std.length(initial);
  const tumbleAxis = std.select(
    d.vec3f(1, 0, 0),
    initial / std.max(initialLength, 0.0001),
    initialLength > 0.0001
  );
  const tumbleBias =
    tumbleAxis * initialLength * initialLength * rotationalDrag * drive;
  const aerodynamicTorque = computeAerodynamicTorque(
    orientation,
    relativeAirVelocity,
    std.max(initialLength, 4) * rotationalDrag,
    drive
  );
  const damping = -rotationalDrag * current * std.length(current);
  let next = current + (tumbleBias + aerodynamicTorque + damping) * dt;
  const maximum = std.max(initialLength * 1.5, 25);
  const magnitudeSquared = std.dot(next, next);
  if (magnitudeSquared > maximum * maximum) {
    next = next * (maximum * std.inverseSqrt(magnitudeSquared));
  }
  return d.vec3f(next);
});
