import { useState } from 'react';
import { getJSON, setJSON } from '../storage/mmkv';
import { DEFAULT_CONFIGS, type ScreenConfig } from '../constants/config';

export function useScreenConfig(screenName: string) {
  const storageKey = `config.${screenName}`;
  const fallback = DEFAULT_CONFIGS[screenName]!;

  const [config, setConfig] = useState<ScreenConfig>(() =>
    getJSON(storageKey, fallback)
  );

  const updateConfig = (partial: Partial<ScreenConfig>) => {
    setConfig((prev) => {
      const next = { ...prev, ...partial };
      setJSON(storageKey, next);
      return next;
    });
  };

  return { config, updateConfig };
}
