import { describe, expect, it } from '@jest/globals';

import {
  DEFAULT_OPACITY_ANIMATION,
  interpolateOpacity,
  resolveOpacityAnimation,
} from '../fadeOut';
import type { OpacityAnimation } from '../types';

describe('opacityAnimation', () => {
  it('is disabled when omitted or explicitly disabled', () => {
    expect(resolveOpacityAnimation(undefined)).toBeNull();
    expect(resolveOpacityAnimation({ enabled: false })).toBeNull();
  });

  it('uses the default animation when keyframes are omitted', () => {
    expect(resolveOpacityAnimation({ enabled: true })).toBe(
      DEFAULT_OPACITY_ANIMATION
    );
  });

  it.each([
    ['the former boolean API', true],
    ['an array', []],
    ['an object without enabled', {}],
    ['a non-boolean enabled value', { enabled: 1 }],
  ])('rejects %s', (_label, value) => {
    expect(() =>
      resolveOpacityAnimation(value as unknown as OpacityAnimation)
    ).toThrow('[react-native-fast-confetti] Invalid opacityAnimation');
  });

  it('sorts custom timestamps and linearly interpolates every segment', () => {
    const curve = resolveOpacityAnimation({
      enabled: true,
      keyframes: { 1: 0, 0.6: 0.4, 0.3: 1 },
    });

    expect(curve).toEqual({
      timestamps: [0, 0.3, 0.6, 1],
      opacities: [1, 1, 0.4, 0],
    });
    expect(
      interpolateOpacity(0.45, curve!.timestamps, curve!.opacities)
    ).toBeCloseTo(0.7, 10);
    expect(
      interpolateOpacity(0.8, curve!.timestamps, curve!.opacities)
    ).toBeCloseTo(0.2, 10);
  });

  it('starts at full opacity and holds the final supplied opacity', () => {
    const curve = resolveOpacityAnimation({
      enabled: true,
      keyframes: { 0.3: 0.8, 0.7: 0.2 },
    })!;

    expect(interpolateOpacity(0, curve.timestamps, curve.opacities)).toBe(1);
    expect(interpolateOpacity(1, curve.timestamps, curve.opacities)).toBe(0.2);
  });

  it('interpolates from full opacity through the supplied sequence', () => {
    const curve = resolveOpacityAnimation({
      enabled: true,
      keyframes: { 0.5: 0.5, 0.7: 0 },
    })!;

    expect(curve).toEqual({
      timestamps: [0, 0.5, 0.7],
      opacities: [1, 0.5, 0],
    });
    expect(interpolateOpacity(0, curve.timestamps, curve.opacities)).toBe(1);
    expect(
      interpolateOpacity(0.25, curve.timestamps, curve.opacities)
    ).toBeCloseTo(0.75, 10);
    expect(
      interpolateOpacity(0.6, curve.timestamps, curve.opacities)
    ).toBeCloseTo(0.25, 10);
    expect(interpolateOpacity(0.7, curve.timestamps, curve.opacities)).toBe(0);
  });

  it('allows an explicit timestamp-zero opacity to override the default', () => {
    const curve = resolveOpacityAnimation({
      enabled: true,
      keyframes: { 0: 0.25, 1: 0 },
    })!;

    expect(interpolateOpacity(0, curve.timestamps, curve.opacities)).toBe(0.25);
  });

  it.each([
    ['array keyframes', [0, 1]],
    ['only a timestamp-zero point', { 0: 0 }],
    ['an out-of-range timestamp', { 0: 1, 1.1: 0 }],
    ['a non-numeric timestamp', { 0: 1, nope: 0 }],
    ['an out-of-range opacity', { 0: 1, 1: -0.1 }],
    ['a non-finite opacity', { 0: 1, 1: Number.NaN }],
    ['duplicate numeric timestamps', { 0.1: 1, '1e-1': 0, 1: 0 }],
  ])('rejects %s', (_label, value) => {
    expect(() =>
      resolveOpacityAnimation({
        enabled: true,
        keyframes: value as unknown as OpacityAnimation['keyframes'],
      })
    ).toThrow('[react-native-fast-confetti] Invalid opacityAnimation');
  });
});
