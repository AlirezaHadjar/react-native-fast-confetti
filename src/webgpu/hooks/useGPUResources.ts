import { useEffect, useState } from 'react';
import { useLatestCallback } from '../../hooks/useLatestCallback';

type Params<Config, Resources> = {
  config: Config;
  create: (config: Config, isCancelled: () => boolean) => Promise<Resources>;
  destroy: (resources: Resources) => void;
  onReadyChange: (ready: boolean) => void;
  onError?: (error: unknown) => void;
};

const reportDefaultError = (error: unknown) => console.error(error);

/** Owns cancellable asynchronous creation; GPU-safe retirement stays with the canvas. */
export const useGPUResources = <Config, Resources>({
  config,
  create,
  destroy,
  onReadyChange,
  onError = reportDefaultError,
}: Params<Config, Resources>) => {
  const [resources, setResources] = useState<Resources | null>(null);
  const reportError = useLatestCallback(onError);

  useEffect(() => {
    onReadyChange(false);
    let cancelled = false;

    void create(config, () => cancelled)
      .then((nextResources) => {
        if (cancelled) {
          destroy(nextResources);
          return;
        }
        setResources(nextResources);
      })
      .catch((error: unknown) => {
        if (!cancelled) reportError(error);
      });

    return () => {
      cancelled = true;
    };
  }, [config, create, destroy, onReadyChange, reportError]);

  return resources;
};
