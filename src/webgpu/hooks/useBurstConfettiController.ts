import { useCallback, useEffect, useState } from 'react';
import type {
  EasingFunction,
  EasingFunctionFactory,
} from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';

import { useAnimationLifecycle } from '../../hooks/useAnimationLifecycle';
import type { OpacityAnimation } from '../../types';

type StartRequest = {
  nonce: number;
  delay: number;
  notifyStart: boolean;
};

type Params = {
  duration: number;
  infinite: boolean;
  opacityAnimation?: OpacityAnimation;
  easing?: EasingFunction | EasingFunctionFactory;
  onAnimationStart?: () => void;
  onAnimationEnd?: () => void;
  advanceCycle: () => void;
  visibleCount: number;
  renderCount: number;
  autoplay: boolean;
  autoStartDelay: number;
};

export const useBurstConfettiController = ({
  duration,
  infinite,
  opacityAnimation,
  easing,
  onAnimationStart,
  onAnimationEnd,
  advanceCycle,
  visibleCount,
  renderCount,
  autoplay,
  autoStartDelay,
}: Params) => {
  const [startRequest, setStartRequest] = useState<StartRequest>({
    nonce: 0,
    delay: 0,
    notifyStart: true,
  });
  const [rendererReady, setRendererReady] = useState(false);

  const requestStart = useCallback((delay = 0, notifyStart = true) => {
    setStartRequest((request) => ({
      nonce: request.nonce + 1,
      delay,
      notifyStart,
    }));
  }, []);

  const prepareNextCycle = useCallback(() => {
    setRendererReady(false);
    advanceCycle();
    requestStart(0, false);
  }, [advanceCycle, requestStart]);

  const onCycleEnd = useCallback(() => {
    'worklet';
    scheduleOnRN(prepareNextCycle);
  }, [prepareNextCycle]);

  const lifecycle = useAnimationLifecycle({
    duration,
    infinite,
    opacityAnimation,
    easing,
    onAnimationStart,
    onAnimationEnd,
    onCycleEnd,
    deferInfiniteRestart: true,
    disabled: visibleCount === 0,
  });

  useEffect(() => {
    if (!rendererReady || renderCount === 0) return;
    if (!autoplay || startRequest.nonce !== 0 || lifecycle.running.get())
      return;
    scheduleOnUI(lifecycle.runAnimation, autoStartDelay);
  }, [
    rendererReady,
    renderCount,
    autoplay,
    startRequest.nonce,
    lifecycle.running,
    lifecycle.runAnimation,
    autoStartDelay,
  ]);

  useEffect(() => {
    if (startRequest.nonce === 0) return;
    if (!rendererReady || renderCount === 0) return;
    scheduleOnUI(
      lifecycle.runAnimation,
      startRequest.delay,
      startRequest.notifyStart
    );
  }, [startRequest, rendererReady, renderCount, lifecycle.runAnimation]);

  return {
    ...lifecycle,
    requestStart,
    setRendererReady,
  };
};
