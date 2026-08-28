import { useCallback, useEffect, useRef, useState } from 'react';
import { scheduleOnUI } from 'react-native-worklets';

import { useLatestCallback } from '../../hooks/useLatestCallback';
import { useRendererAutoplay } from './useRendererAutoplay';
import { useBurstSimulationLifecycle } from './useBurstSimulationLifecycle';

type StartRequest = {
  nonce: number;
  notifyStart: boolean;
};

type Params = {
  onAnimationStart?: () => void;
  onAnimationEnd?: () => void;
  ready: boolean;
  renderCount: number;
  autoplay: boolean;
  autoStartDelay: number;
};

/**
 * Event-only controller for burst renderers. Animation time belongs to the
 * dedicated GPU frame callback; this hook owns only imperative controls,
 * autoplay, readiness, and public callbacks.
 */
export const useBurstConfettiController = ({
  onAnimationStart,
  onAnimationEnd,
  ready,
  renderCount,
  autoplay,
  autoStartDelay,
}: Params) => {
  const [startRequest, setStartRequest] = useState<StartRequest>({
    nonce: 0,
    notifyStart: true,
  });
  const handledStartRequestRef = useRef(0);
  const [rendererReady, setRendererReady] = useState(false);
  const notifyAnimationStart = useLatestCallback(onAnimationStart);
  const notifyAnimationEnd = useLatestCallback(onAnimationEnd);
  const lifecycle = useBurstSimulationLifecycle();
  const completeEmptyCycle = useCallback(
    (notifyStart = true) => {
      scheduleOnUI(lifecycle.completeCycle);
      if (notifyStart) notifyAnimationStart();
      notifyAnimationEnd();
    },
    [lifecycle.completeCycle, notifyAnimationEnd, notifyAnimationStart]
  );

  const suppressPendingAutoplay = useRendererAutoplay({
    enabled: ready && (renderCount === 0 || rendererReady),
    autoplay,
    autoStartDelay,
    running: lifecycle.running,
    beginCycle: lifecycle.beginCycle,
    onAnimationStart: notifyAnimationStart,
    empty: renderCount === 0,
    onEmpty: completeEmptyCycle,
  });

  const requestStart = useCallback(
    (notifyStart = true) => {
      suppressPendingAutoplay();
      setStartRequest((request) => ({
        nonce: request.nonce + 1,
        notifyStart,
      }));
    },
    [suppressPendingAutoplay]
  );

  useEffect(() => {
    if (
      startRequest.nonce === 0 ||
      startRequest.nonce === handledStartRequestRef.current ||
      !ready ||
      (renderCount > 0 && !rendererReady)
    ) {
      return;
    }
    handledStartRequestRef.current = startRequest.nonce;
    if (renderCount === 0) {
      completeEmptyCycle(startRequest.notifyStart);
      return;
    }
    scheduleOnUI(lifecycle.beginCycle);
    if (startRequest.notifyStart) notifyAnimationStart();
  }, [
    startRequest,
    ready,
    rendererReady,
    renderCount,
    completeEmptyCycle,
    lifecycle.beginCycle,
    notifyAnimationStart,
  ]);

  return {
    ...lifecycle,
    requestStart,
    setRendererReady,
    suppressPendingAutoplay,
    notifyAnimationEnd,
  };
};
