import { useCallback, useEffect, useState } from 'react';
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
  renderCount,
  autoplay,
  autoStartDelay,
}: Params) => {
  const [startRequest, setStartRequest] = useState<StartRequest>({
    nonce: 0,
    notifyStart: true,
  });
  const [rendererReady, setRendererReady] = useState(false);
  const notifyAnimationStart = useLatestCallback(onAnimationStart);
  const notifyAnimationEnd = useLatestCallback(onAnimationEnd);
  const lifecycle = useBurstSimulationLifecycle();

  const suppressPendingAutoplay = useRendererAutoplay({
    enabled: rendererReady && renderCount > 0,
    autoplay,
    autoStartDelay,
    running: lifecycle.running,
    beginCycle: lifecycle.beginCycle,
    onAnimationStart: notifyAnimationStart,
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
    if (startRequest.nonce === 0 || !rendererReady || renderCount === 0) return;
    scheduleOnUI(lifecycle.beginCycle);
    if (startRequest.notifyStart) notifyAnimationStart();
  }, [
    startRequest,
    rendererReady,
    renderCount,
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
