import {
  SCHEDULE_ACCUMULATOR,
  SCHEDULE_ALPHA,
  SCHEDULE_STEPS,
  writeFixedStepSchedule,
} from './fixedStepScheduler';

export const BURST_SCHEDULE_ACCUMULATOR = 0;
export const BURST_SCHEDULE_STEPS = 1;
export const BURST_SCHEDULE_ALPHA = 2;
export const BURST_SCHEDULE_REINITIALIZE = 3;
export const BURST_SCHEDULE_TARGET_TIME = 4;
export const BURST_SCHEDULE_VALUE_COUNT = 5;

/**
 * Converts the burst lifecycle's eased target time into bounded fixed steps.
 * Backward time is a generation reset, never a negative integration step.
 */
export const writeBurstFixedStepSchedule = (
  previousTargetSeconds: number,
  targetSeconds: number,
  previousAccumulatorSeconds: number,
  fixedStepScratch: Float64Array,
  output: Float64Array
) => {
  'worklet';

  const safeTarget = Math.max(targetSeconds, 0);
  const reinitialize =
    !Number.isFinite(previousTargetSeconds) ||
    safeTarget + Number.EPSILON < previousTargetSeconds;
  const targetDelta = reinitialize
    ? safeTarget
    : Math.max(safeTarget - previousTargetSeconds, 0);
  const startingAccumulator = reinitialize
    ? 0
    : Math.max(previousAccumulatorSeconds, 0);

  writeFixedStepSchedule(startingAccumulator, targetDelta, fixedStepScratch);

  output[BURST_SCHEDULE_ACCUMULATOR] = fixedStepScratch[SCHEDULE_ACCUMULATOR]!;
  output[BURST_SCHEDULE_STEPS] = fixedStepScratch[SCHEDULE_STEPS]!;
  output[BURST_SCHEDULE_ALPHA] = fixedStepScratch[SCHEDULE_ALPHA]!;
  output[BURST_SCHEDULE_REINITIALIZE] = reinitialize ? 1 : 0;
  output[BURST_SCHEDULE_TARGET_TIME] = safeTarget;
};
