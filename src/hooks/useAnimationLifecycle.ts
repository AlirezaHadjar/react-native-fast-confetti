import { useCallback, useLayoutEffect, useMemo } from 'react';
import {
  cancelAnimation,
  Easing,
  ReduceMotion,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withTiming,
  type EasingFunction,
  type EasingFunctionFactory,
} from 'react-native-reanimated';
import { useAnimationCallbacks } from './useAnimationCallbacks';
import {
  interpolateOpacity,
  resolveOpacityAnimation,
} from '../fadeOut';
import type { OpacityAnimation } from '../types';

type UseAnimationLifecycleParams = {
  duration: number;
  infinite: boolean;
  opacityAnimation?: OpacityAnimation;
  easing?: EasingFunction | EasingFunctionFactory;
  onAnimationStart?: () => void;
  onAnimationEnd?: () => void;
  /** Worklet called at the end of each animation cycle (before looping). */
  onCycleEnd?: () => void;
  /** Wait for the caller to restart an infinite cycle after onCycleEnd. */
  deferInfiniteRestart?: boolean;
  disabled?: boolean;
};

export const useAnimationLifecycle = ({
  duration,
  infinite,
  opacityAnimation,
  easing: easingProp = Easing.linear,
  onAnimationStart,
  onAnimationEnd,
  onCycleEnd,
  deferInfiniteRestart = false,
  disabled = false,
}: UseAnimationLifecycleParams) => {
  const progress = useSharedValue(0);
  const running = useSharedValue(false);
  const visible = useSharedValue(false);
  const resolvedOpacityAnimation = useMemo(
    () => resolveOpacityAnimation(opacityAnimation),
    [opacityAnimation]
  );

  const { UIOnStart, UIOnEnd } = useAnimationCallbacks(
    onAnimationStart,
    onAnimationEnd
  );

  useLayoutEffect(() => {
    return () => {
      // A layout effect is required: its cleanup runs in React's deletion
      // phase BEFORE host views are removed, whereas a passive useEffect
      // cleanup would run after the canvas is already destroyed.
      running.set(false);
      cancelAnimation(progress);
    };
  }, [progress, running]);

  const opacity = useDerivedValue(() => {
    if (!visible.get()) return 0;
    if (!resolvedOpacityAnimation) return 1;
    return interpolateOpacity(
      progress.get(),
      resolvedOpacityAnimation.timestamps,
      resolvedOpacityAnimation.opacities
    );
  }, [resolvedOpacityAnimation, visible]);

  const pause = useCallback(() => {
    'worklet';
    running.set(false);
    cancelAnimation(progress);
  }, [running, progress]);

  const reset = useCallback(() => {
    'worklet';
    running.set(false);
    visible.set(false);
    cancelAnimation(progress);
    progress.set(0);
  }, [progress, running, visible]);

  const runAnimation = useCallback(
    (delay: number = 0, notifyStart = true) => {
      'worklet';
      if (disabled) {
        running.set(false);
        visible.set(false);
        cancelAnimation(progress);
        progress.set(0);
        if (notifyStart) UIOnStart();
        UIOnEnd();
        return;
      }
      progress.set(0);
      visible.set(true);
      running.set(true);
      if (notifyStart) UIOnStart();

      function repeatAnimation() {
        'worklet';
        UIOnEnd();
        onCycleEnd?.();
        if (infinite) {
          cancelAnimation(progress);
          progress.set(0);
          progress.set(
            withTiming(
              1,
              {
                duration,
                easing: Easing.linear,
                reduceMotion: ReduceMotion.Never,
              },
              (finished) => {
                'worklet';
                if (!finished || !infinite) return;
                repeatAnimation();
              }
            )
          );
        }
      }

      const animation = withTiming(
        1,
        { duration, easing: easingProp, reduceMotion: ReduceMotion.Never },
        (finished) => {
          'worklet';
          if (!finished) return;
          if (!infinite) {
            UIOnEnd();
            return;
          }
          if (deferInfiniteRestart) {
            running.set(false);
            UIOnEnd();
            onCycleEnd?.();
            return;
          }
          repeatAnimation();
        }
      );

      progress.set(
        delay > 0 ? withDelay(delay, animation, ReduceMotion.Never) : animation
      );
    },
    [
      progress,
      running,
      visible,
      UIOnStart,
      UIOnEnd,
      onCycleEnd,
      infinite,
      duration,
      easingProp,
      deferInfiniteRestart,
      disabled,
    ]
  );

  const resume = useCallback(() => {
    'worklet';
    if (disabled) return;
    if (running.get()) return;
    visible.set(true);
    running.set(true);

    const remaining = duration * (1 - progress.get());

    function repeatAnimation() {
      'worklet';
      UIOnEnd();
      onCycleEnd?.();
      if (infinite) {
        cancelAnimation(progress);
        progress.set(0);
        progress.set(
          withTiming(
            1,
            {
              duration,
              easing: Easing.linear,
              reduceMotion: ReduceMotion.Never,
            },
            (finished) => {
              'worklet';
              if (!finished || !infinite) return;
              repeatAnimation();
            }
          )
        );
      }
    }

    progress.set(
      withTiming(
        1,
        {
          duration: remaining,
          easing: easingProp,
          reduceMotion: ReduceMotion.Never,
        },
        (finished) => {
          'worklet';
          if (!finished) return;
          if (!infinite) {
            UIOnEnd();
            return;
          }
          if (deferInfiniteRestart) {
            running.set(false);
            UIOnEnd();
            onCycleEnd?.();
            return;
          }
          repeatAnimation();
        }
      )
    );
  }, [
    running,
    progress,
    visible,
    duration,
    UIOnEnd,
    onCycleEnd,
    infinite,
    easingProp,
    deferInfiniteRestart,
    disabled,
  ]);

  return {
    progress,
    running,
    opacity,
    pause,
    reset,
    resume,
    runAnimation,
  };
};
