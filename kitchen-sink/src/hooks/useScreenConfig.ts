import { useState } from 'react';
import { getJSON, setJSON } from '../storage/mmkv';
import { DEFAULT_CONFIGS, type ScreenConfig } from '../constants/config';
import { useRenderer } from './useRenderer';

export function useScreenConfig(screenName: string) {
  const { renderer, setRenderer } = useRenderer();
  const storageKey = `config.${screenName}`;
  const fallback = DEFAULT_CONFIGS[screenName]!;

  const [config, setConfig] = useState<ScreenConfig>(() => ({
    ...fallback,
    ...getJSON<Partial<ScreenConfig>>(storageKey, {}),
    renderer,
  }));

  const updateConfig = (partial: Partial<ScreenConfig>) => {
    if (partial.renderer) setRenderer(partial.renderer);
    setConfig((prev) => {
      const next = {
        ...prev,
        ...partial,
        renderer: partial.renderer ?? renderer,
      };
      setJSON(storageKey, next);
      return next;
    });
  };

  return {
    config: config.renderer === renderer ? config : { ...config, renderer },
    updateConfig,
  };
}
