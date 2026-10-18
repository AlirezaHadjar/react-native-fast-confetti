import { d, std, tgpu } from 'typegpu';

export const quaternionMultiply = tgpu.fn(
  [d.vec4f, d.vec4f],
  d.vec4f
)((left, right) => {
  'use gpu';

  return d.vec4f(
    left.w * right.xyz + right.w * left.xyz + std.cross(left.xyz, right.xyz),
    left.w * right.w - std.dot(left.xyz, right.xyz)
  );
});

export const quaternionConjugate = tgpu.fn(
  [d.vec4f],
  d.vec4f
)((quaternion) => {
  'use gpu';

  return d.vec4f(-quaternion.x, -quaternion.y, -quaternion.z, quaternion.w);
});

export const rotateByQuaternion = tgpu.fn(
  [d.vec4f, d.vec3f],
  d.vec3f
)((quaternion, vector) => {
  'use gpu';

  const imaginary = quaternion.xyz;
  return (
    2 * std.dot(imaginary, vector) * imaginary +
    (quaternion.w * quaternion.w - std.dot(imaginary, imaginary)) * vector +
    2 * quaternion.w * std.cross(imaginary, vector)
  );
});

export const integrateQuaternion = tgpu.fn(
  [d.vec4f, d.vec3f, d.f32],
  d.vec4f
)((quaternion, angularVelocity, dt) => {
  'use gpu';

  const angularQuaternion = d.vec4f(angularVelocity, 0);
  const delta = 0.5 * dt * quaternionMultiply(angularQuaternion, quaternion);
  return std.normalize(quaternion + delta);
});

export const hashU32 = tgpu.fn(
  [d.u32],
  d.u32
)((value) => {
  'use gpu';

  let mixed = value;
  mixed = (mixed ^ std.bitShiftRight(mixed, d.u32(16))) * d.u32(0x7feb352d);
  mixed = (mixed ^ std.bitShiftRight(mixed, d.u32(15))) * d.u32(0x846ca68b);
  return mixed ^ std.bitShiftRight(mixed, d.u32(16));
});

export const random01 = tgpu.fn(
  [d.u32, d.u32, d.u32],
  d.f32
)((index, lane, seed) => {
  'use gpu';

  const mixed =
    index * d.u32(0x9e3779b9) +
    lane * d.u32(0x85ebca6b) +
    seed * d.u32(0xc2b2ae35);
  const top24 = std.bitShiftRight(hashU32(mixed), d.u32(8));
  return d.f32(top24) * (1 / 16777216);
});

export const randomRange = tgpu.fn(
  [d.u32, d.u32, d.u32, d.f32, d.f32],
  d.f32
)((index, lane, seed, min, max) => {
  'use gpu';

  return min + random01(index, lane, seed) * (max - min);
});
