import { useEffect } from 'react';
import type { RefObject } from 'react';

import {
  retireGPUResourceSet,
  type GPUFrameRetirement,
} from '../resourceCleanup';

type RetirableResources = {
  queue: GPUQueue;
};

export const useGPUResourceRetirement = <Resources extends RetirableResources>(
  resources: Resources | null,
  frameRetirementsRef: RefObject<WeakMap<Resources, GPUFrameRetirement>>,
  destroy: (resources: Resources) => void
) => {
  useEffect(() => {
    if (!resources) return;
    const frameRetirements = frameRetirementsRef.current;
    return () => {
      void retireGPUResourceSet(
        resources.queue,
        () => destroy(resources),
        frameRetirements.get(resources)?.promise
      );
    };
  }, [destroy, frameRetirementsRef, resources]);
};
