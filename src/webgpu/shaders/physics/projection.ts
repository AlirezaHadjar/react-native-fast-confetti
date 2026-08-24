import { d, std, tgpu } from 'typegpu';

export const projectParticlePoint = tgpu.fn(
  [d.vec3f, d.vec2f, d.f32],
  d.vec2f
)((point, viewport, focalLength) => {
  'use gpu';

  const center = viewport * 0.5;
  const cameraDistance = std.max(point.z + focalLength, 1);
  return d.vec2f(
    center.x + (point.x - center.x) * (focalLength / cameraDistance),
    center.y + (point.y - center.y) * (focalLength / cameraDistance)
  );
});

export const normalizeOrFallback2 = tgpu.fn(
  [d.vec2f, d.vec2f],
  d.vec2f
)((value, fallback) => {
  'use gpu';

  const length = std.length(value);
  return d.vec2f(
    std.select(fallback, value / std.max(length, 0.0001), length > 0.0001)
  );
});

export const clampProjectedAxis = tgpu.fn(
  [d.vec2f, d.vec2f, d.f32],
  d.vec2f
)((axis, fallback, minimumLength) => {
  'use gpu';

  return (
    normalizeOrFallback2(axis, fallback) *
    std.max(std.length(axis), minimumLength)
  );
});
