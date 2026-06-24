import { describe, expect, test } from '@jest/globals';
import {
  DEFAULT_REDUCE_MOTION_FACTOR,
  clampReduceMotionFactor,
  isReduceMotionPieceVisible,
  reduceCountForMotion,
  reduceMotionScale,
  resolveReduceMotionFactor,
  scaleRangeForMotion,
} from '../reduceMotion';

describe('Reduce Motion utilities', () => {
  test('resolves string modes', () => {
    expect(resolveReduceMotionFactor(undefined, true)).toBe(
      DEFAULT_REDUCE_MOTION_FACTOR
    );
    expect(resolveReduceMotionFactor('system', true)).toBe(
      DEFAULT_REDUCE_MOTION_FACTOR
    );
    expect(resolveReduceMotionFactor('system', false)).toBe(0);
    expect(resolveReduceMotionFactor('never', true)).toBe(0);
  });

  test('resolves object modes', () => {
    expect(
      resolveReduceMotionFactor({ mode: 'system', factor: 0.75 }, true)
    ).toBe(0.75);
    expect(
      resolveReduceMotionFactor({ mode: 'system', factor: 0.75 }, false)
    ).toBe(0);
    expect(
      resolveReduceMotionFactor({ mode: 'always', factor: 0.25 }, false)
    ).toBe(0.25);
  });

  test('clamps invalid factors', () => {
    expect(clampReduceMotionFactor(-1)).toBe(0);
    expect(clampReduceMotionFactor(2)).toBe(1);
    expect(clampReduceMotionFactor(Number.NaN)).toBe(
      DEFAULT_REDUCE_MOTION_FACTOR
    );
  });

  test('maps factor to density and motion scale', () => {
    expect(reduceMotionScale(0)).toBe(1);
    expect(reduceMotionScale(0.5)).toBe(0.5);
    expect(reduceMotionScale(1)).toBe(0);

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
      isReduceMotionPieceVisible(index, 10, 4)
    );

    expect(visible.filter(Boolean)).toHaveLength(4);
    expect(isReduceMotionPieceVisible(0, 10, 0)).toBe(false);
    expect(isReduceMotionPieceVisible(0, 10, 10)).toBe(true);
  });
});
