import type { Range, ReduceMotionConfig, Rotation } from './types';

export const DEFAULT_REDUCE_MOTION_FACTOR = 0.5;

export function clampReduceMotionFactor(factor: number): number {
  if (!Number.isFinite(factor)) return DEFAULT_REDUCE_MOTION_FACTOR;
  return Math.min(Math.max(factor, 0), 1);
}

export function resolveReduceMotionFactor(
  config: ReduceMotionConfig | undefined,
  systemReduceMotionEnabled: boolean
): number {
  if (config === 'never') return 0;

  if (config === undefined || config === 'system') {
    return systemReduceMotionEnabled ? DEFAULT_REDUCE_MOTION_FACTOR : 0;
  }

  const factor = clampReduceMotionFactor(
    config.factor ?? DEFAULT_REDUCE_MOTION_FACTOR
  );

  if (config.mode === 'always') return factor;

  return systemReduceMotionEnabled ? factor : 0;
}

export function reduceMotionScale(factor: number): number {
  return 1 - clampReduceMotionFactor(factor);
}

export function reduceCountForMotion(count: number, factor: number): number {
  const normalizedCount = Math.max(0, Math.round(count));
  const scale = reduceMotionScale(factor);

  if (normalizedCount === 0 || scale === 0) return 0;

  return Math.max(1, Math.round(normalizedCount * scale));
}

export function isReduceMotionPieceVisible(
  index: number,
  totalCount: number,
  visibleCount: number
): boolean {
  'worklet';
  if (visibleCount <= 0 || totalCount <= 0) return false;
  if (visibleCount >= totalCount) return true;

  return (
    Math.floor((index * visibleCount) / totalCount) !==
    Math.floor(((index + 1) * visibleCount) / totalCount)
  );
}

export function scaleValueForMotion(value: number, factor: number): number {
  return value * reduceMotionScale(factor);
}

export function scaleRangeForMotion(
  range: Range | undefined,
  factor: number
): Range | undefined {
  if (!range) return undefined;
  const scale = reduceMotionScale(factor);
  return {
    min: range.min * scale,
    max: range.max * scale,
  };
}

export function scaleRotationForMotion(
  rotation: Rotation | undefined,
  factor: number
): Rotation | undefined {
  if (!rotation) return undefined;
  return {
    x: scaleRangeForMotion(rotation.x, factor),
    z: scaleRangeForMotion(rotation.z, factor),
  };
}
