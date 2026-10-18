import { useEffect } from 'react';
import { retireGPUResourceSet } from '../resourceCleanup';

const pendingRetirements = new WeakMap<object, ReturnType<typeof setTimeout>>();

export const useGPUResourceRetirement = <Resources extends object>(
  resources: Resources | null,
  destroy: (resources: Resources) => void | Promise<void>
) => {
  useEffect(() => {
    if (!resources) return;
    const pendingRetirement = pendingRetirements.get(resources);
    if (pendingRetirement !== undefined) {
      clearTimeout(pendingRetirement);
      pendingRetirements.delete(resources);
    }

    // Frame and surface layout cleanups run first. The owner barrier in
    // retireGPUResourceSet acknowledges their queued work before recycling.
    return () => {
      const retirement = setTimeout(() => {
        if (pendingRetirements.get(resources) !== retirement) return;
        pendingRetirements.delete(resources);
        void retireGPUResourceSet(() => destroy(resources));
      }, 0);
      pendingRetirements.set(resources, retirement);
    };
  }, [destroy, resources]);
};
