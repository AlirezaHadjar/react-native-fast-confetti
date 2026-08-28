import { useCallback } from 'react';
import { useSharedValue } from 'react-native-reanimated';

/**
 * Control-only lifecycle for the stateful GPU simulation. The canvas owns the
 * sole frame clock, so this hook deliberately registers no UI frame callback.
 */
export const useSimulationLifecycle = () => {
  const running = useSharedValue(false);
  const visibility = useSharedValue(0);

  const pause = useCallback(() => {
    'worklet';
    running.set(false);
  }, [running]);

  const resume = useCallback(() => {
    'worklet';
    visibility.set(1);
    running.set(true);
  }, [running, visibility]);

  const reset = useCallback(() => {
    'worklet';
    running.set(false);
    visibility.set(0);
  }, [running, visibility]);

  const beginCycle = useCallback(() => {
    'worklet';
    visibility.set(1);
    running.set(true);
  }, [running, visibility]);

  const completeCycle = useCallback(() => {
    'worklet';
    running.set(false);
  }, [running]);

  return {
    running,
    visibility,
    pause,
    resume,
    reset,
    beginCycle,
    completeCycle,
  };
};
