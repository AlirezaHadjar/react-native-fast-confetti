import { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { resolveReduceMotionFactor } from '../reduceMotion';
import type { ReduceMotionConfig } from '../types';

export function useReduceMotionFactor(
  config: ReduceMotionConfig | undefined
): { factor: number; ready: boolean } {
  const hasObjectConfig = config != null && typeof config === 'object';
  const mode = hasObjectConfig ? config.mode : (config ?? 'system');
  const configFactor = hasObjectConfig ? config.factor : undefined;
  const listensToSystemReduceMotion = mode === 'system';

  const initialSystemReduceMotion = useReducedMotion();
  const [systemReduceMotion, setSystemReduceMotion] = useState({
    enabled: initialSystemReduceMotion,
    ready: !listensToSystemReduceMotion || initialSystemReduceMotion,
  });

  useEffect(() => {
    if (!listensToSystemReduceMotion) return;

    let mounted = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setSystemReduceMotion({ enabled, ready: true });
      })
      .catch(() => {});

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (enabled) => setSystemReduceMotion({ enabled, ready: true })
    );

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, [listensToSystemReduceMotion]);

  return useMemo(() => {
    const effectiveFactor = (() => {
      if (hasObjectConfig) {
        return resolveReduceMotionFactor(
          { mode: mode as 'system' | 'always', factor: configFactor },
          systemReduceMotion.enabled
        );
      }

      return resolveReduceMotionFactor(
        mode as 'system' | 'never',
        systemReduceMotion.enabled
      );
    })();

    return {
      factor: effectiveFactor,
      ready: !listensToSystemReduceMotion || systemReduceMotion.ready,
    };
  }, [
    hasObjectConfig,
    mode,
    configFactor,
    listensToSystemReduceMotion,
    systemReduceMotion,
  ]);
}
