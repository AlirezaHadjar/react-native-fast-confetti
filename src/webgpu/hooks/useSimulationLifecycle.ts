import { useCallback } from 'react';
import { useFrameCallback, useSharedValue } from 'react-native-reanimated';

type Params = {
  fadeOutOnEnd?: boolean;
  enabled?: boolean;
};

/**
 * Replaces the old `withTiming`-driven lifecycle with a real-time
 * `useFrameCallback` loop. The simulation no longer has a predetermined
 * duration: `elapsed` ticks forward in seconds while `running` is true.
 * Callers (Confetti.tsx) decide when to end a "cycle" — typically when the
 * GPU alive-counter reports that every piece has left the viewport.
 */
export const useSimulationLifecycle = ({ enabled = true }: Params = {}) => {
  const elapsed = useSharedValue(0);
  const running = useSharedValue(false);
  const cycleCount = useSharedValue(0);
  // Opacity driven from JS thread on fade-out requests; default 1.
  const opacity = useSharedValue(1);

  useFrameCallback((fi) => {
    'worklet';
    if (!enabled) return;
    if (!running.get()) return;
    const dtMs = fi.timeSincePreviousFrame ?? 16.7;
    // Guard against huge dt on first frame after pause/mount.
    const dt = Math.min(dtMs / 1000, 1 / 30);
    elapsed.set(elapsed.get() + dt);
  }, enabled);

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
    elapsed.set(0);
    cycleCount.set(0);
    opacity.set(1);
  }, [running, elapsed, cycleCount, opacity]);

  const beginCycle = useCallback(() => {
    'worklet';
    elapsed.set(0);
    running.set(true);
    opacity.set(1);
  }, [elapsed, running, opacity]);

  const bumpCycle = useCallback(() => {
    'worklet';
    cycleCount.set(cycleCount.get() + 1);
    elapsed.set(0);
  }, [cycleCount, elapsed]);

  return {
    elapsed,
    running,
    cycleCount,
    opacity,
    pause,
    resume,
    reset,
    beginCycle,
    bumpCycle,
  };
};
