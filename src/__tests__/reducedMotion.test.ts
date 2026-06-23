import { describe, expect, test } from '@jest/globals';
import {
  DEFAULT_REDUCED_MOTION_FACTOR,
  clampReducedMotionFactor,
  isReducedMotionPieceVisible,
  reduceCountForMotion,
  reducedMotionScale,
  resolveReducedMotionFactor,
  scaleRangeForMotion,
} from '../reducedMotion';

describe('reduced motion utilities', () => {
  test('resolves string modes', () => {
    expect(resolveReducedMotionFactor(undefined, true)).toBe(
      DEFAULT_REDUCED_MOTION_FACTOR
    );
    expect(resolveReducedMotionFactor('system', true)).toBe(
      DEFAULT_REDUCED_MOTION_FACTOR
    );
    expect(resolveReducedMotionFactor('system', false)).toBe(0);
    expect(resolveReducedMotionFactor('never', true)).toBe(0);
  });

  test('resolves object modes', () => {
    expect(
      resolveReducedMotionFactor({ mode: 'system', factor: 0.75 }, true)
    ).toBe(0.75);
    expect(
      resolveReducedMotionFactor({ mode: 'system', factor: 0.75 }, false)
    ).toBe(0);
    expect(
      resolveReducedMotionFactor({ mode: 'always', factor: 0.25 }, false)
    ).toBe(0.25);
  });

  test('clamps invalid factors', () => {
    expect(clampReducedMotionFactor(-1)).toBe(0);
    expect(clampReducedMotionFactor(2)).toBe(1);
    expect(clampReducedMotionFactor(Number.NaN)).toBe(
      DEFAULT_REDUCED_MOTION_FACTOR
    );
  });

  test('maps factor to density and motion scale', () => {
    expect(reducedMotionScale(0)).toBe(1);
    expect(reducedMotionScale(0.5)).toBe(0.5);
    expect(reducedMotionScale(1)).toBe(0);

    expect(reduceCountForMotion(200, 0)).toBe(200);
    expect(reduceCountForMotion(200, 0.5)).toBe(100);
    expect(reduceCountForMotion(200, 1)).toBe(0);
    expect(reduceCountForMotion(1, 0.99)).toBe(1);
  });

  test('scales ranges without mutating undefined', () => {
    expect(scaleRangeForMotion(undefined, 0.5)).toBeUndefined();
    expect(scaleRangeForMotion({ min: 2, max: 4 }, 0.5)).toEqual({
      min: 1,
      max: 2,
    });
  });

  test('selects a stable visible subset without changing buffer length', () => {
    const visible = Array.from({ length: 10 }, (_, index) =>
      isReducedMotionPieceVisible(index, 10, 4)
    );

    expect(visible.filter(Boolean)).toHaveLength(4);
    expect(isReducedMotionPieceVisible(0, 10, 0)).toBe(false);
    expect(isReducedMotionPieceVisible(0, 10, 10)).toBe(true);
  });
});
