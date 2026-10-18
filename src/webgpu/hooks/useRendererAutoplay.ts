import { useCallback, useEffect, useRef } from 'react';
import { scheduleOnUI } from 'react-native-worklets';

import type { ReadableValue } from '../controlValues';

type Params = {
  enabled: boolean;
  autoplay: boolean;
  autoStartDelay: number;
  running: ReadableValue<boolean>;
  beginCycle: () => void;
  onAnimationStart: () => void;
  empty?: boolean;
  onEmpty?: () => void;
};

export const useRendererAutoplay = ({
  enabled,
  autoplay,
  autoStartDelay,
  running,
  beginCycle,
  onAnimationStart,
  empty = false,
  onEmpty,
}: Params) => {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressedRef = useRef(false);
  const configRef = useRef({ autoplay, autoStartDelay });

  const clearPendingAutoplay = useCallback(() => {
    if (timerRef.current === null) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const suppressPendingAutoplay = useCallback(() => {
    suppressedRef.current = true;
    clearPendingAutoplay();
  }, [clearPendingAutoplay]);

  useEffect(() => {
    const previousConfig = configRef.current;
    if (
      previousConfig.autoplay !== autoplay ||
      previousConfig.autoStartDelay !== autoStartDelay
    ) {
      configRef.current = { autoplay, autoStartDelay };
      suppressedRef.current = false;
    }

    clearPendingAutoplay();
    if (enabled && autoplay && !suppressedRef.current) {
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        if (suppressedRef.current) return;
        if (empty) {
          onEmpty?.();
          return;
        }
        if (running.get()) return;
        scheduleOnUI(beginCycle);
        onAnimationStart();
      }, autoStartDelay);
    }

    return clearPendingAutoplay;
  }, [
    enabled,
    autoplay,
    autoStartDelay,
    running,
    beginCycle,
    onAnimationStart,
    empty,
    onEmpty,
    clearPendingAutoplay,
  ]);

  return suppressPendingAutoplay;
};
