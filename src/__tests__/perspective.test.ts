import { describe, expect, it } from '@jest/globals';

import {
  getParticleNearPlaneDistance,
  isParticleInFrontOfNearPlane,
} from '../webgpu/perspective';

describe('WebGPU particle near-plane clipping', () => {
  it('derives the near plane from each particle configured depth', () => {
    expect(getParticleNearPlaneDistance(900)).toBe(450);
    expect(getParticleNearPlaneDistance(1)).toBe(1);
  });

  it('keeps a complete particle in front of the near plane', () => {
    expect(isParticleInFrontOfNearPlane(900, 450, 5, 8, 3, 4)).toBe(true);
  });

  it('clips the complete particle when a rotated axis crosses the plane', () => {
    expect(isParticleInFrontOfNearPlane(470, 450, 12, 9, 0, 0)).toBe(false);
  });

  it('includes procedural bend and motion blur in the conservative bound', () => {
    expect(isParticleInFrontOfNearPlane(480, 450, 4, 5, 12, 10)).toBe(false);
  });

  it('keeps geometry whose nearest point is exactly on the near plane', () => {
    expect(isParticleInFrontOfNearPlane(481, 450, 4, 5, 12, 10)).toBe(true);
  });
});
