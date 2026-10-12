import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

const runtime = globalThis as unknown as {
  document?: unknown;
  navigator?: { product?: string };
};

const useClientLayoutEffect =
  runtime.document !== undefined || runtime.navigator?.product === 'ReactNative'
    ? useLayoutEffect
    : useEffect;

/**
 * Returns a stable function that invokes the callback from the latest commit.
 * Intended for events and imperative boundaries, not values used during render.
 */
export const useLatestCallback = <Args extends unknown[], Result>(
  callback: ((...args: Args) => Result) | undefined
) => {
  const callbackRef = useRef(callback);

  useClientLayoutEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  return useCallback(
    (...args: Args): Result | undefined => callbackRef.current?.(...args),
    []
  );
};
