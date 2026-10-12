import { useCallback } from 'react';
import { useGPURuntimeValue } from './useGPURuntimeValue';

/**
 * Control signals specific to finite and repeating GPU burst simulations.
 * Animation time itself belongs to the canvas's dedicated frame callback.
 */
export const useBurstSimulationLifecycle = () => {
  const running = useGPURuntimeValue(false);
  const visibility = useGPURuntimeValue(0);
  const resetVersion = useGPURuntimeValue(0);
  const finished = useGPURuntimeValue(false);

  const pause = useCallback(() => {
    'worklet';
    running.set(false);
  }, [running]);

  const resume = useCallback(() => {
    'worklet';
    if (finished.get()) return;
    visibility.set(1);
    running.set(true);
  }, [finished, running, visibility]);

  const reset = useCallback(() => {
    'worklet';
    running.set(false);
    visibility.set(0);
    finished.set(false);
    resetVersion.set(resetVersion.get() + 1);
  }, [finished, resetVersion, running, visibility]);

  const beginCycle = useCallback(() => {
    'worklet';
    finished.set(false);
    visibility.set(1);
    running.set(true);
  }, [finished, running, visibility]);

  const completeCycle = useCallback(() => {
    'worklet';
    running.set(false);
    finished.set(true);
  }, [finished, running]);

  return {
    running,
    visibility,
    resetVersion,
    pause,
    resume,
    reset,
    beginCycle,
    completeCycle,
  };
};
