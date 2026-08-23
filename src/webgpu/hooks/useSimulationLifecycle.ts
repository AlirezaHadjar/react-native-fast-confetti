import { useCallback } from 'react';
import { useSharedValue } from 'react-native-reanimated';

/**
 * Control-only lifecycle for the stateful GPU simulation. The canvas owns the
 * sole frame clock, so this hook deliberately registers no UI frame callback.
 */
export const useSimulationLifecycle = () => {
  const running = useSharedValue(false);
  const opacity = useSharedValue(1);

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
    opacity.set(1);
  }, [running, opacity]);

  const beginCycle = useCallback(() => {
    'worklet';
    running.set(true);
    opacity.set(1);
  }, [running, opacity]);

  return {
    running,
    opacity,
    pause,
    resume,
    reset,
    beginCycle,
  };
};
