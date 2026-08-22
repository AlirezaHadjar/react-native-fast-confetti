import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';

import type { RendererType } from '../constants/config';
import { getJSON, setJSON } from '../storage/mmkv';

const RENDERER_STORAGE_KEY = 'performance.renderer';

type RendererContextValue = {
  renderer: RendererType;
  setRenderer: (renderer: RendererType) => void;
};

const RendererContext = createContext<RendererContextValue | null>(null);

export function RendererProvider({ children }: PropsWithChildren) {
  const [renderer, setRendererState] = useState<RendererType>(() =>
    getJSON<RendererType>(RENDERER_STORAGE_KEY, 'webgpu')
  );
  const setRenderer = useCallback((nextRenderer: RendererType) => {
    setRendererState((currentRenderer) => {
      if (currentRenderer === nextRenderer) return currentRenderer;
      setJSON(RENDERER_STORAGE_KEY, nextRenderer);
      return nextRenderer;
    });
  }, []);
  const value = useMemo(
    () => ({ renderer, setRenderer }),
    [renderer, setRenderer]
  );

  return (
    <RendererContext.Provider value={value}>
      {children}
    </RendererContext.Provider>
  );
}

export function useRenderer() {
  const value = useContext(RendererContext);
  if (!value) {
    throw new Error('useRenderer must be used inside RendererProvider');
  }
  return value;
}
