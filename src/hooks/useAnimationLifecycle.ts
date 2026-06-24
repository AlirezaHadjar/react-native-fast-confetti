import { useCallback } from 'react';
import {
  cancelAnimation,
  Easing,
  ReduceMotion,
  type EasingFunction,
  type EasingFunctionFactory,
  Extrapolation,
  interpolate,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { useAnimationCallbacks } from './useAnimationCallbacks';

type UseAnimationLifecycleParams = {
  duration: number;
  infinite: boolean;
  fadeOutOnEnd: boolean;
  easing?: EasingFunction | EasingFunctionFactory;
  onAnimationStart?: () => void;
  onAnimationEnd?: () => void;
  /** Opacity fade interpolation input range. @default [0.8, 1] */
  fadeRange?: [number, number];
  /** Worklet called at the end of each animation cycle (before looping). */
  onCycleEnd?: () => void;
  disabled?: boolean;
};

export const useAnimationLifecycle = ({
  duration,
  infinite,
  fadeOutOnEnd,
  easing: easingProp = Easing.linear,
  onAnimationStart,
  onAnimationEnd,
  fadeRange = [0.8, 1],
  onCycleEnd,
  disabled = false,
}: UseAnimationLifecycleParams) => {
  const progress = useSharedValue(0);
  const running = useSharedValue(false);

  const { UIOnStart, UIOnEnd } = useAnimationCallbacks(
    onAnimationStart,
    onAnimationEnd
  );

  const opacity = useDerivedValue(() => {
    if (!fadeOutOnEnd) return 1;
    return interpolate(progress.get(), fadeRange, [1, 0], Extrapolation.CLAMP);
  }, [fadeOutOnEnd, fadeRange]);

  const pause = useCallback(() => {
    'worklet';
    running.set(false);
    cancelAnimation(progress);
  }, [running, progress]);

  const reset = useCallback(() => {
    'worklet';
    running.set(false);
    cancelAnimation(progress);
    progress.set(0);
  }, [running, progress]);

  const runAnimation = useCallback(
    (delay: number = 0) => {
      'worklet';
      if (disabled) {
        running.set(false);
        cancelAnimation(progress);
        progress.set(0);
        UIOnStart();
        UIOnEnd();
        return;
      }
      progress.set(0);
      running.set(true);
      UIOnStart();

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
          if (!finished || !infinite) {
            if (finished) UIOnEnd();
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
      UIOnStart,
      UIOnEnd,
      onCycleEnd,
      infinite,
      duration,
      easingProp,
      disabled,
    ]
  );

  const resume = useCallback(() => {
    'worklet';
    if (disabled) return;
    if (running.get()) return;
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
          if (!finished || !infinite) {
            if (finished) UIOnEnd();
            return;
          }
          repeatAnimation();
        }
      )
    );
  }, [
    running,
    progress,
    duration,
    UIOnEnd,
    onCycleEnd,
    infinite,
    easingProp,
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
