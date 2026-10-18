import { d, std, tgpu } from 'typegpu';

/**
 * Biases a uniform sample toward the emitter center while retaining the full
 * configured radius. The density approaches zero at the hard spread limit,
 * which prevents a visible cone silhouette without exceeding the public
 * `spread` contract.
 */
export const sampleCenterWeightedRadius = (unitSample: number) => {
  'use gpu';

  return unitSample * unitSample;
};

/**
 * A bounded triangular distribution. Cannon speeds cluster around the
 * configured midpoint instead of forming equally dense minimum/maximum flight
 * envelopes.
 */
export const sampleCenteredUnit = (first: number, second: number) => {
  'use gpu';

  return (first + second) * 0.5;
};

/**
 * Samples a deterministic solid cone around a screen-space aim direction.
 * Radial sampling is center-weighted and azimuth spans the screen-lateral/depth
 * plane, so Cannon launches occupy real 3D volume rather than a 2D wedge.
 */
export const sampleSoftConeDirection = tgpu.fn(
  [d.vec2f, d.f32, d.f32, d.f32],
  d.vec3f
)((aimDelta, halfSpread, radialUnit, azimuthUnit) => {
  'use gpu';

  const aimLength = std.length(aimDelta);
  const aim = std.select(
    d.vec2f(0, -1),
    aimDelta / std.max(aimLength, 0.0001),
    aimLength > 0.0001
  );
  const forward = d.vec3f(aim, 0);
  const lateral = d.vec3f(-aim.y, aim.x, 0);
  const depth = d.vec3f(0, 0, 1);
  const radialFraction = sampleCenterWeightedRadius(radialUnit);
  const polarAngle = std.clamp(halfSpread, 0, 3.14159265359) * radialFraction;
  const azimuth = azimuthUnit * 6.28318530718;
  const radialAxis = lateral * std.cos(azimuth) + depth * std.sin(azimuth);

  return std.normalize(
    forward * std.cos(polarAngle) + radialAxis * std.sin(polarAngle)
  );
});
