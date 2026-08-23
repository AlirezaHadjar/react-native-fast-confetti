import type { OpacityAnimation, OpacityKeyframes } from './types';

export type ResolvedOpacityAnimation = {
  readonly timestamps: readonly number[];
  readonly opacities: readonly number[];
};

export const DEFAULT_OPACITY_ANIMATION: ResolvedOpacityAnimation = {
  timestamps: [0.8, 1],
  opacities: [1, 0],
};

const invalidOpacityAnimation = (reason: string): never => {
  throw new Error(
    `[react-native-fast-confetti] Invalid opacityAnimation: ${reason}`
  );
};

export const resolveOpacityAnimation = (
  value: OpacityAnimation | undefined
): ResolvedOpacityAnimation | null => {
  if (value === undefined) return null;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return invalidOpacityAnimation('expected an object.');
  }
  if (value.enabled !== undefined && typeof value.enabled !== 'boolean') {
    return invalidOpacityAnimation('enabled must be a boolean.');
  }
  if (value.enabled === false) return null;
  if (value.keyframes === undefined) return DEFAULT_OPACITY_ANIMATION;

  const keyframes: OpacityKeyframes = value.keyframes;
  if (
    typeof keyframes !== 'object' ||
    keyframes === null ||
    Array.isArray(keyframes)
  ) {
    return invalidOpacityAnimation('keyframes must be an object.');
  }

  const entries = Object.entries(keyframes);
  if (entries.length === 0) {
    return invalidOpacityAnimation('keyframes require at least one point.');
  }

  const points = entries.map(([rawTimestamp, opacity]) => {
    if (rawTimestamp.trim() === '') {
      return invalidOpacityAnimation(
        'timestamps must be numbers between 0 and 1.'
      );
    }
    const timestamp = Number(rawTimestamp);
    if (!Number.isFinite(timestamp) || timestamp < 0 || timestamp > 1) {
      return invalidOpacityAnimation(
        `timestamp "${rawTimestamp}" must be between 0 and 1.`
      );
    }
    if (
      typeof opacity !== 'number' ||
      !Number.isFinite(opacity) ||
      opacity < 0 ||
      opacity > 1
    ) {
      return invalidOpacityAnimation(
        `opacity at timestamp "${rawTimestamp}" must be between 0 and 1.`
      );
    }
    return { opacity, rawTimestamp, timestamp };
  });

  points.sort((a, b) => a.timestamp - b.timestamp);
  for (let index = 1; index < points.length; index++) {
    if (points[index]!.timestamp === points[index - 1]!.timestamp) {
      return invalidOpacityAnimation(
        `timestamps "${points[index - 1]!.rawTimestamp}" and "${points[index]!.rawTimestamp}" resolve to the same number.`
      );
    }
  }

  if (points[0]!.timestamp > 0) {
    points.unshift({ opacity: 1, rawTimestamp: '0', timestamp: 0 });
  }
  if (points.length < 2) {
    return invalidOpacityAnimation(
      'a curve starting at timestamp 0 requires at least one later point.'
    );
  }

  return {
    timestamps: points.map((point) => point.timestamp),
    opacities: points.map((point) => point.opacity),
  };
};

export const interpolateOpacity = (
  progress: number,
  timestamps: readonly number[],
  opacities: readonly number[]
) => {
  'worklet';
  const lastIndex = timestamps.length - 1;
  if (lastIndex < 0) return 1;
  if (progress <= timestamps[0]!) return opacities[0]!;
  if (progress >= timestamps[lastIndex]!) return opacities[lastIndex]!;

  let low = 0;
  let high = lastIndex;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (progress < timestamps[middle]!) {
      high = middle;
    } else {
      low = middle;
    }
  }

  const startTime = timestamps[low]!;
  const endTime = timestamps[high]!;
  const segmentProgress = (progress - startTime) / (endTime - startTime);
  const startOpacity = opacities[low]!;
  return startOpacity + (opacities[high]! - startOpacity) * segmentProgress;
};
