import { makeMutable } from 'react-native-reanimated';

type AnyFunction = (...args: Array<any>) => any;

const PENDING_TIMEOUTS = makeMutable<Record<string, boolean>>({});
const TIMEOUT_ID = makeMutable(0);

export type AnimatedTimeoutID = number;

const removeFromPendingTimeouts = (id: AnimatedTimeoutID): void => {
  'worklet';
  PENDING_TIMEOUTS.modify((pendingTimeouts) => {
    'worklet';
    delete pendingTimeouts[id];
    return pendingTimeouts;
  });
};

export const setAnimatedTimeout = <F extends AnyFunction>(
  callback: F,
  delay: number
): AnimatedTimeoutID => {
  'worklet';
  let startTimestamp: number;

  const currentId = TIMEOUT_ID.get();
  PENDING_TIMEOUTS.modify((pendingTimeouts) => {
    'worklet';
    // @ts-ignore
    pendingTimeouts[currentId] = true;
    return pendingTimeouts;
  });
  TIMEOUT_ID.set(TIMEOUT_ID.get() + 1);

  const step = (newTimestamp: number) => {
    if (!PENDING_TIMEOUTS.get()[currentId]) {
      return;
    }
    if (startTimestamp === undefined) {
      startTimestamp = newTimestamp;
    }
    if (newTimestamp >= startTimestamp + delay) {
      removeFromPendingTimeouts(currentId);
      callback();
      return;
    }
    requestAnimationFrame(step);
  };

  requestAnimationFrame(step);

  return currentId;
};

export const clearAnimatedTimeout = (handle: AnimatedTimeoutID): void => {
  'worklet';
  removeFromPendingTimeouts(handle);
};
