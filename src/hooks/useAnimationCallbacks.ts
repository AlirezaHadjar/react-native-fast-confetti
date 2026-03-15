import { useCallback } from 'react';
import { scheduleOnRN } from 'react-native-worklets';

export const useAnimationCallbacks = (
  onAnimationStart?: () => void,
  onAnimationEnd?: () => void
) => {
  const JSOnStart = useCallback(() => onAnimationStart?.(), [onAnimationStart]);
  const JSOnEnd = useCallback(() => onAnimationEnd?.(), [onAnimationEnd]);

  const UIOnStart = useCallback(() => {
    'worklet';
    scheduleOnRN(JSOnStart);
  }, [JSOnStart]);

  const UIOnEnd = useCallback(() => {
    'worklet';
    scheduleOnRN(JSOnEnd);
  }, [JSOnEnd]);

  return { UIOnStart, UIOnEnd };
};
