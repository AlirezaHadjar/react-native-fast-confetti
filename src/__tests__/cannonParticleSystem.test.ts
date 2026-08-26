import { describe, expect, it } from '@jest/globals';
import {
  evaluateCannonParticle,
  projectCannonParticleHeight,
} from '../cannonParticleSystem';
import type { CannonParticle } from '../types';

const particle: CannonParticle = {
  originIndex: 0,
  colorIndex: 1,
  sizeIndex: 2,
  startTime: 100,
  x: 0.1,
  y: 0.4,
  velocityX: 1,
  velocityY: -0.5,
  horizontalDrag: 1,
  verticalDrag: 1,
  gravity: 0.5,
  rotation: 0.2,
  angularVelocity: 2,
  rotationX: 0.4,
  angularVelocityX: 3,
  flipDepth: 0.6,
  size: 0.02,
};

describe('evaluateCannonParticle', () => {
  it('is hidden before its launch time', () => {
    expect(evaluateCannonParticle(particle, 99)).toBeNull();
  });

  it('starts at its fitted initial state', () => {
    expect(evaluateCannonParticle(particle, 100)).toEqual({
      x: 0.1,
      y: 0.4,
      rotation: 0.2,
      rotationX: 0.4,
      flipDepth: 0.6,
      size: 0.02,
    });
  });

  it('uses damped horizontal motion and gravity-driven vertical motion', () => {
    const state = evaluateCannonParticle(particle, 1100);
    expect(state?.x).toBeCloseTo(0.1 + 1 - Math.exp(-1));
    expect(state?.y).toBeCloseTo(0.4 + 0.5 - (1 - Math.exp(-1)));
    expect(state?.rotation).toBeCloseTo(2.2);
    expect(state?.rotationX).toBeCloseTo(3.4);
    expect(state?.flipDepth).toBeCloseTo(0.6);
    expect(state?.size).toBeCloseTo(0.02);
  });

  it('keeps particle scale stable throughout its flight', () => {
    const state = evaluateCannonParticle(particle, 600);
    expect(state?.size).toBeCloseTo(0.02);
  });

  it('only approaches edge-on for particles with a fitted full-depth flip', () => {
    expect(projectCannonParticleHeight(Math.PI / 2, 0)).toBe(1);
    expect(projectCannonParticleHeight(Math.PI / 2, 0.6)).toBeCloseTo(0.4);
    expect(projectCannonParticleHeight(Math.PI / 2, 1)).toBeCloseTo(0);
    expect(projectCannonParticleHeight(Math.PI, 1)).toBeCloseTo(-1);
  });
});
