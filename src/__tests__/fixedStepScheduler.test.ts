import { describe, expect, it } from '@jest/globals';

import {
  FIXED_SIMULATION_STEP_SECONDS,
  MAX_SIMULATION_STEPS_PER_FRAME,
  SCHEDULE_ACCUMULATOR,
  SCHEDULE_ALPHA,
  SCHEDULE_STEPS,
  SCHEDULE_VALUE_COUNT,
  writeFixedStepSchedule,
} from '../webgpu/fixedStepScheduler';

const runSchedule = (frameDeltas: number[]) => {
  const output = new Float64Array(SCHEDULE_VALUE_COUNT);
  let accumulator = 0;
  let steps = 0;
  for (const delta of frameDeltas) {
    writeFixedStepSchedule(accumulator, delta, output);
    accumulator = output[SCHEDULE_ACCUMULATOR]!;
    steps += output[SCHEDULE_STEPS]!;
  }
  return { accumulator, steps, alpha: output[SCHEDULE_ALPHA]! };
};

describe('fixed-step GPU schedule', () => {
  it('produces the same physics step count at 60 Hz and 120 Hz', () => {
    const at60 = runSchedule(Array.from({ length: 60 }, () => 1 / 60));
    const at120 = runSchedule(Array.from({ length: 120 }, () => 1 / 120));

    expect(at60.steps).toBe(120);
    expect(at120.steps).toBe(120);
    expect(at60.accumulator).toBeCloseTo(at120.accumulator, 10);
  });

  it('is invariant to jitter when elapsed time is equivalent', () => {
    const steady = runSchedule(Array.from({ length: 60 }, () => 1 / 60));
    const jittered = runSchedule(
      Array.from({ length: 30 }, () => [1 / 240, 7 / 240]).flat()
    );

    expect(jittered.steps).toBe(steady.steps);
    expect(jittered.accumulator).toBeCloseTo(steady.accumulator, 10);
  });

  it('bounds a dispatch without discarding simulation debt', () => {
    const output = new Float64Array(SCHEDULE_VALUE_COUNT);
    const delta = FIXED_SIMULATION_STEP_SECONDS * 20;
    writeFixedStepSchedule(0, delta, output);

    expect(output[SCHEDULE_STEPS]).toBe(MAX_SIMULATION_STEPS_PER_FRAME);
    expect(output[SCHEDULE_ACCUMULATOR]).toBeCloseTo(
      FIXED_SIMULATION_STEP_SECONDS * 12,
      10
    );

    writeFixedStepSchedule(output[SCHEDULE_ACCUMULATOR]!, 0, output);
    expect(output[SCHEDULE_STEPS]).toBe(MAX_SIMULATION_STEPS_PER_FRAME);
    expect(output[SCHEDULE_ACCUMULATOR]).toBeCloseTo(
      FIXED_SIMULATION_STEP_SECONDS * 4,
      10
    );
  });

  it('keeps interpolation alpha finite and normalized while catching up', () => {
    const output = new Float64Array(SCHEDULE_VALUE_COUNT);
    writeFixedStepSchedule(0, 1, output);

    expect(Number.isFinite(output[SCHEDULE_ALPHA])).toBe(true);
    expect(output[SCHEDULE_ALPHA]).toBeGreaterThanOrEqual(0);
    expect(output[SCHEDULE_ALPHA]).toBeLessThanOrEqual(1);
  });
});
