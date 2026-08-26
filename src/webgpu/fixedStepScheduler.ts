export const FIXED_SIMULATION_STEP_SECONDS = 1 / 120;
export const MAX_SIMULATION_STEPS_PER_FRAME = 8;
export const MAX_RECOVERABLE_FRAME_DELTA_SECONDS =
  FIXED_SIMULATION_STEP_SECONDS * MAX_SIMULATION_STEPS_PER_FRAME;

export const SCHEDULE_ACCUMULATOR = 0;
export const SCHEDULE_STEPS = 1;
export const SCHEDULE_ALPHA = 2;
export const SCHEDULE_VALUE_COUNT = 3;

export const CYCLE_ELAPSED = 0;
export const CYCLE_COMPLETIONS = 1;
export const CYCLE_VALUE_COUNT = 2;

export const getLoopingCycleDuration = (
  infinite: boolean,
  continuous: boolean,
  cycleDurationSeconds: number
) => {
  'worklet';
  return infinite && !continuous ? cycleDurationSeconds : 0;
};

/**
 * Returns only frame time that can be simulated completely before rendering.
 * A longer interruption is a presentation pause, not physics debt that should
 * leak into later visible frames.
 */
export const getRecoverableFrameDeltaSeconds = (
  frameDeltaSeconds: number
) => {
  'worklet';
  const safeDelta = Math.max(frameDeltaSeconds, 0);
  return safeDelta <=
    MAX_RECOVERABLE_FRAME_DELTA_SECONDS + Number.EPSILON
    ? safeDelta
    : 0;
};

/**
 * Advances a caller-owned cycle clock. A positive duration loops the clock at
 * whole-cycle boundaries; zero keeps elapsed time unbounded. The output array
 * keeps this helper allocation-free on the frame path.
 */
export const writeCycleClock = (
  previousElapsedSeconds: number,
  deltaSeconds: number,
  loopingDurationSeconds: number,
  output: Float64Array
) => {
  'worklet';
  const elapsed = previousElapsedSeconds + Math.max(deltaSeconds, 0);
  if (loopingDurationSeconds <= 0) {
    output[CYCLE_ELAPSED] = elapsed;
    output[CYCLE_COMPLETIONS] = 0;
    return;
  }

  const completions = Math.floor(elapsed / loopingDurationSeconds);
  output[CYCLE_ELAPSED] =
    elapsed - completions * loopingDurationSeconds;
  output[CYCLE_COMPLETIONS] = completions;
};

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
