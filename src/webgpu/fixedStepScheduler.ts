export const FIXED_SIMULATION_STEP_SECONDS = 1 / 120;
export const MAX_SIMULATION_STEPS_PER_FRAME = 8;
export const SUSPENSION_GAP_SECONDS = 0.25;

export const SCHEDULE_ACCUMULATOR = 0;
export const SCHEDULE_STEPS = 1;
export const SCHEDULE_ALPHA = 2;
export const SCHEDULE_VALUE_COUNT = 3;

/**
 * Writes a fixed-step schedule into a caller-owned array to avoid allocating on
 * the frame path. Unprocessed time remains in the accumulator, so a bounded
 * frame never silently changes the physics result.
 */
export const writeFixedStepSchedule = (
  previousAccumulator: number,
  targetDeltaSeconds: number,
  output: Float64Array
) => {
  'worklet';
  let accumulator = previousAccumulator + Math.max(targetDeltaSeconds, 0);
  const availableSteps = Math.floor(
    (accumulator + FIXED_SIMULATION_STEP_SECONDS * 0.000001) /
      FIXED_SIMULATION_STEP_SECONDS
  );
  const steps = Math.min(availableSteps, MAX_SIMULATION_STEPS_PER_FRAME);
  accumulator = Math.max(
    0,
    accumulator - steps * FIXED_SIMULATION_STEP_SECONDS
  );

  output[SCHEDULE_ACCUMULATOR] = accumulator;
  output[SCHEDULE_STEPS] = steps;
  output[SCHEDULE_ALPHA] = Math.min(
    accumulator / FIXED_SIMULATION_STEP_SECONDS,
    1
  );
};

