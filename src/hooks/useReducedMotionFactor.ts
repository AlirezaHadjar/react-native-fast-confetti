import { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { resolveReducedMotionFactor } from '../reducedMotion';
import type { ReducedMotionConfig } from '../types';

export function useReducedMotionFactor(
  config: ReducedMotionConfig | undefined
): { factor: number; ready: boolean } {
  const hasObjectConfig = config != null && typeof config === 'object';
  const mode = hasObjectConfig ? config.mode : (config ?? 'system');
  const configFactor = hasObjectConfig ? config.factor : undefined;
  const listensToSystemReducedMotion = mode === 'system';

  const initialSystemReducedMotion = useReducedMotion();
  const [systemReducedMotion, setSystemReducedMotion] = useState({
    enabled: initialSystemReducedMotion,
    ready: !listensToSystemReducedMotion || initialSystemReducedMotion,
  });

  useEffect(() => {
    if (!listensToSystemReducedMotion) return;

    let mounted = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setSystemReducedMotion({ enabled, ready: true });
      })
      .catch(() => {});

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (enabled) => setSystemReducedMotion({ enabled, ready: true })
    );

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, [listensToSystemReducedMotion]);

  return useMemo(() => {
    const effectiveFactor = (() => {
      if (hasObjectConfig) {
        return resolveReducedMotionFactor(
          { mode: mode as 'system' | 'always', factor: configFactor },
          systemReducedMotion.enabled
        );
      }

      return resolveReducedMotionFactor(
        mode as 'system' | 'never',
        systemReducedMotion.enabled
      );
    })();

    return {
      factor: effectiveFactor,
      ready: !listensToSystemReducedMotion || systemReducedMotion.ready,
    };
  }, [
    hasObjectConfig,
    mode,
    configFactor,
    listensToSystemReducedMotion,
    systemReducedMotion,
  ]);
}
