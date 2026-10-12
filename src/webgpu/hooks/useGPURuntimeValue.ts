import { useState } from 'react';
import { Platform } from 'react-native';
import { makeMutable } from 'react-native-reanimated';
import { createSynchronizable } from 'react-native-worklets';

/** Private GPU state must not make a UI-runtime round trip each tick. */
export const useGPURuntimeValue = <Value>(initial: Value) => {
  const [valueAccess] = useState(() => {
    if (Platform.OS !== 'android') return makeMutable(initial);
    const value = createSynchronizable(initial);
    return {
      get: () => {
        'worklet';
        return value.getBlocking();
      },
      set: (next: Value) => {
        'worklet';
        value.setBlocking(next);
      },
    };
  });
  return valueAccess;
};
