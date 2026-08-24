import { useCallback } from 'react';
import { useSharedValue } from 'react-native-reanimated';

/**
 * Control-only lifecycle for the stateful GPU simulation. The canvas owns the
 * sole frame clock, so this hook deliberately registers no UI frame callback.
 */
export const useSimulationLifecycle = () => {
  const running = useSharedValue(false);

  const pause = useCallback(() => {
    'worklet';
    running.set(false);
  }, [running]);

  const resume = useCallback(() => {
    'worklet';
    running.set(true);
  }, [running]);

  const reset = useCallback(() => {
    'worklet';
    running.set(false);
  }, [running]);

  const beginCycle = useCallback(() => {
    'worklet';
    running.set(true);
  }, [running]);

  return {
    running,
    pause,
    resume,
    reset,
    beginCycle,
  };
};
