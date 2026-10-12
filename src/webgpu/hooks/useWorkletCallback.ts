import { useEffect, useLayoutEffect, useState } from 'react';

import { useLatestCallback } from '../../hooks/useLatestCallback';

type RegisteredCallback = () => void;

const runtime = globalThis as unknown as {
  document?: unknown;
  navigator?: { product?: string };
};

const useClientLayoutEffect =
  runtime.document !== undefined || runtime.navigator?.product === 'ReactNative'
    ? useLayoutEffect
    : useEffect;

let nextCallbackId = 1;
const callbacks = new Map<number, RegisteredCallback>();

/** A single bounded remote function shared by every worklet callback. */
export const dispatchWorkletCallback = (id: number) => {
  callbacks.get(id)?.();
};

/**
 * Registers the latest callback behind a primitive ID that is safe to capture
 * in a long-lived worklet. The entry is removed with its owning component.
 */
export const useWorkletCallback = (callback: RegisteredCallback) => {
  const [id] = useState(() => nextCallbackId++);
  const invokeLatest = useLatestCallback(callback);

  useClientLayoutEffect(() => {
    callbacks.set(id, invokeLatest);
    return () => {
      callbacks.delete(id);
    };
  }, [id, invokeLatest]);

  return id;
};
