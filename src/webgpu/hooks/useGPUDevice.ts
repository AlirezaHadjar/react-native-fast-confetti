import { useEffect, useSyncExternalStore } from 'react';
import { warnIfNotHardwareAccelerated } from 'react-native-webgpu';
import { useLatestCallback } from '../../hooks/useLatestCallback';

type Listener = () => void;

type GPUDeviceStore = {
  acquire: () => Promise<GPUDevice | null>;
  getErrorSnapshot: () => unknown;
  getSnapshot: () => GPUDevice | null;
  subscribe: (listener: Listener) => () => void;
};

export const createGPUDeviceStore = (
  requestDevice: () => Promise<GPUDevice | null>
): GPUDeviceStore => {
  let device: GPUDevice | null = null;
  let error: unknown = null;
  let devicePromise: Promise<GPUDevice | null> | null = null;
  const listeners = new Set<Listener>();

  const notify = () => {
    for (const listener of listeners) listener();
  };

  const acquire = (): Promise<GPUDevice | null> => {
    if (devicePromise) return devicePromise;

    let pendingDevice: Promise<GPUDevice | null>;
    pendingDevice = Promise.resolve()
      .then(requestDevice)
      .catch((nextError: unknown) => {
        if (devicePromise === pendingDevice) {
          error = nextError;
          devicePromise = null;
          notify();
        }
        return null;
      })
      .then((nextDevice) => {
        if (devicePromise !== pendingDevice) return nextDevice;

        device = nextDevice;
        error = null;
        notify();

        if (nextDevice) {
          void nextDevice.lost.then(() => {
            if (device !== nextDevice) return;

            device = null;
            devicePromise = null;
            notify();

            if (listeners.size > 0) void acquire();
          });
        }

        return nextDevice;
      });
    devicePromise = pendingDevice;
    return pendingDevice;
  };

  return {
    acquire,
    getErrorSnapshot: () => error,
    getSnapshot: () => device,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};

type AdapterWarning = (adapter: GPUAdapter) => void;

export const requestDefaultGPUDevice = async (
  gpu: GPU,
  warnForFallback: AdapterWarning = warnIfNotHardwareAccelerated
) => {
  const adapter = await gpu.requestAdapter({
    powerPreference: 'high-performance',
  });
  if (!adapter) {
    throw new Error('[react-native-fast-confetti] WebGPU adapter unavailable');
  }
  warnForFallback(adapter);
  return adapter.requestDevice();
};

const sharedGPUDeviceStore = createGPUDeviceStore(() =>
  requestDefaultGPUDevice(navigator.gpu)
);

const subscribeToNothing = () => () => {};
const getNullSnapshot = () => null;
const reportDefaultError = (error: unknown) => console.error(error);

/**
 * Borrows an injected device or lazily acquires the package-wide shared device.
 * Injected devices remain entirely owned by the caller.
 */
export const useGPUDevice = (
  injectedDevice?: GPUDevice,
  onError: (error: unknown) => void = reportDefaultError
) => {
  const useSharedDevice = injectedDevice === undefined;
  const reportError = useLatestCallback(onError);
  const sharedDevice = useSyncExternalStore(
    useSharedDevice ? sharedGPUDeviceStore.subscribe : subscribeToNothing,
    useSharedDevice ? sharedGPUDeviceStore.getSnapshot : getNullSnapshot,
    getNullSnapshot
  );
  const sharedError = useSyncExternalStore(
    useSharedDevice ? sharedGPUDeviceStore.subscribe : subscribeToNothing,
    useSharedDevice ? sharedGPUDeviceStore.getErrorSnapshot : getNullSnapshot,
    getNullSnapshot
  );

  useEffect(() => {
    if (!useSharedDevice) return;
    void sharedGPUDeviceStore.acquire();
  }, [useSharedDevice]);

  useEffect(() => {
    if (sharedError !== null) reportError(sharedError);
  }, [reportError, sharedError]);

  return injectedDevice ?? sharedDevice;
};
