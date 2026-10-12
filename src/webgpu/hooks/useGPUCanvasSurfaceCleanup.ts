import { useLayoutEffect } from 'react';
import type { WritableValue } from '../controlValues';

import { unconfigureCanvasSurface } from '../configureCanvasSurface';

type SurfaceState = {
  context: GPUCanvasContext & { present?: () => void };
};

/** Runs before React deletes the native canvas host, while unconfigure is safe. */
export const useGPUCanvasSurfaceCleanup = (
  activeState: SurfaceState | null,
  surfaceReady: WritableValue<boolean>,
  onReadyChange: (ready: boolean) => void,
  clearInitialized: () => void
) => {
  useLayoutEffect(() => {
    if (!activeState) return;
    return () => {
      onReadyChange(false);
      clearInitialized();
      unconfigureCanvasSurface(activeState.context, surfaceReady);
    };
  }, [activeState, clearInitialized, onReadyChange, surfaceReady]);
};
