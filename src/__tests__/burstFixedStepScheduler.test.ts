import { describe, expect, it } from '@jest/globals';

import {
  BURST_SCHEDULE_ACCUMULATOR,
  BURST_SCHEDULE_ALPHA,
  BURST_SCHEDULE_REINITIALIZE,
  BURST_SCHEDULE_STEPS,
  BURST_SCHEDULE_TARGET_TIME,
  BURST_SCHEDULE_VALUE_COUNT,
  writeBurstFixedStepSchedule,
} from '../webgpu/burstFixedStepScheduler';
import {
  FIXED_SIMULATION_STEP_SECONDS,
  SCHEDULE_VALUE_COUNT,
} from '../webgpu/fixedStepScheduler';

const createState = () => ({
  scratch: new Float64Array(SCHEDULE_VALUE_COUNT),
  output: new Float64Array(BURST_SCHEDULE_VALUE_COUNT),
});

describe('stateful burst fixed-step scheduling', () => {
  it('initializes from zero and advances to the first target', () => {
    const { scratch, output } = createState();
    writeBurstFixedStepSchedule(
      Number.NaN,
      FIXED_SIMULATION_STEP_SECONDS * 2.5,
      10,
      scratch,
      output
    );

    expect(output[BURST_SCHEDULE_REINITIALIZE]).toBe(1);
    expect(output[BURST_SCHEDULE_STEPS]).toBe(2);
    expect(output[BURST_SCHEDULE_ALPHA]).toBeCloseTo(0.5);
    expect(output[BURST_SCHEDULE_TARGET_TIME]).toBeCloseTo(
      FIXED_SIMULATION_STEP_SECONDS * 2.5
    );
  });

  it('retains fixed-step debt while target time is unchanged', () => {
    const { scratch, output } = createState();
    const largeTarget = FIXED_SIMULATION_STEP_SECONDS * 20;
    writeBurstFixedStepSchedule(0, largeTarget, 0, scratch, output);
    const debtAfterFirstFrame = output[BURST_SCHEDULE_ACCUMULATOR]!;

    expect(output[BURST_SCHEDULE_STEPS]).toBe(8);
    expect(debtAfterFirstFrame).toBeGreaterThan(
      FIXED_SIMULATION_STEP_SECONDS
    );

    writeBurstFixedStepSchedule(
      largeTarget,
      largeTarget,
      debtAfterFirstFrame,
      scratch,
      output
    );

    expect(output[BURST_SCHEDULE_REINITIALIZE]).toBe(0);
    expect(output[BURST_SCHEDULE_STEPS]).toBe(8);
    expect(output[BURST_SCHEDULE_ACCUMULATOR]).toBeLessThan(
      debtAfterFirstFrame
    );
  });

  it('reinitializes instead of integrating a backward delta', () => {
    const { scratch, output } = createState();
    writeBurstFixedStepSchedule(2, 0, 0.5, scratch, output);

    expect(output[BURST_SCHEDULE_REINITIALIZE]).toBe(1);
    expect(output[BURST_SCHEDULE_STEPS]).toBe(0);
    expect(output[BURST_SCHEDULE_ACCUMULATOR]).toBe(0);
    expect(output[BURST_SCHEDULE_TARGET_TIME]).toBe(0);
  });

  it('never treats equal target time as another generation', () => {
    const { scratch, output } = createState();
    writeBurstFixedStepSchedule(1, 1, 0, scratch, output);

    expect(output[BURST_SCHEDULE_REINITIALIZE]).toBe(0);
    expect(output[BURST_SCHEDULE_STEPS]).toBe(0);
  });
});
