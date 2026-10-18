import { useRef, type RefObject } from 'react';

/** `init` must be pure; React may call it twice during a Strict Mode mount. */
export const useLazyRef = <T extends object>(init: () => T): RefObject<T> => {
  const resultRef = useRef<T | null>(null);
  if (resultRef.current === null) {
    resultRef.current = init();
  }
  return resultRef as RefObject<T>;
};
