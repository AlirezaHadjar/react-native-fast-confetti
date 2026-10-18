import { d, std, tgpu } from 'typegpu';

const hash13 = tgpu.fn(
  [d.vec3f],
  d.f32
)((position) => {
  'use gpu';

  let value = std.fract(position * 0.1031);
  value = value + std.dot(value, value.zyx + 31.32);
  return std.fract((value.x + value.y) * value.z);
});

const valueNoise3 = tgpu.fn(
  [d.vec3f],
  d.f32
)((position) => {
  'use gpu';

  const cell = std.floor(position);
  const local = std.fract(position);
  const blend = local * local * (3 - 2 * local);
  const bottomNear = std.mix(
    hash13(cell + d.vec3f(0, 0, 0)),
    hash13(cell + d.vec3f(1, 0, 0)),
    blend.x
  );
  const bottomFar = std.mix(
    hash13(cell + d.vec3f(0, 1, 0)),
    hash13(cell + d.vec3f(1, 1, 0)),
    blend.x
  );
  const topNear = std.mix(
    hash13(cell + d.vec3f(0, 0, 1)),
    hash13(cell + d.vec3f(1, 0, 1)),
    blend.x
  );
  const topFar = std.mix(
    hash13(cell + d.vec3f(0, 1, 1)),
    hash13(cell + d.vec3f(1, 1, 1)),
    blend.x
  );
  return std.mix(
    std.mix(bottomNear, bottomFar, blend.y),
    std.mix(topNear, topFar, blend.y),
    blend.z
  );
});

/** Deterministic, spatially and temporally coherent wind used by stateful modes. */
export const computeWindField = tgpu.fn(
  [d.vec3f, d.f32],
  d.vec3f
)((position, time) => {
  'use gpu';

  const scale = d.vec3f(0.006, 0.006, 0.01);
  const timeOffset = d.vec3f(time * 0.25);
  const epsilon = 1;
  const samplePosition = position * scale + timeOffset;
  const derivativeY =
    valueNoise3(samplePosition + d.vec3f(0, epsilon, 0)) -
    valueNoise3(samplePosition - d.vec3f(0, epsilon, 0));
  const derivativeX =
    valueNoise3(samplePosition + d.vec3f(epsilon, 0, 0)) -
    valueNoise3(samplePosition - d.vec3f(epsilon, 0, 0));
  const derivativeZ =
    valueNoise3(samplePosition + d.vec3f(0, 0, epsilon)) -
    valueNoise3(samplePosition - d.vec3f(0, 0, epsilon));
  return d.vec3f(derivativeY, -derivativeX * 0.5, derivativeZ) * 180;
});
