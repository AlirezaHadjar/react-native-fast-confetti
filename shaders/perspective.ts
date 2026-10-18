import { std } from 'typegpu';

/**
 * Limits simulation-driven perspective growth to twice a particle's configured
 * depth scale before the whole particle is clipped at the camera near plane.
 */
export const PARTICLE_NEAR_PLANE_RATIO = 0.5;

export const getParticleNearPlaneDistance = (
  initialCameraDistance: number
): number => {
  'use gpu';

  return std.max(initialCameraDistance * PARTICLE_NEAR_PLANE_RATIO, 1);
};

export const isParticleInFrontOfNearPlane = (
  centerCameraDistance: number,
  nearPlaneDistance: number,
  axisXDepthExtent: number,
  axisYDepthExtent: number,
  bendDepthExtent: number,
  motionBlurDepthExtent: number
): boolean => {
  'use gpu';

  const nearestCameraDistance =
    centerCameraDistance -
    axisXDepthExtent -
    axisYDepthExtent -
    bendDepthExtent -
    motionBlurDepthExtent;

  return nearestCameraDistance >= nearPlaneDistance;
};
