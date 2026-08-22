import { useEffect, useSyncExternalStore } from 'react';

type Listener = () => void;

type GPUDeviceStore = {
  acquire: () => Promise<GPUDevice | null>;
  getSnapshot: () => GPUDevice | null;
  subscribe: (listener: Listener) => () => void;
};

export const createGPUDeviceStore = (
  requestDevice: () => Promise<GPUDevice | null>,
  onError: (error: unknown) => void = console.error
): GPUDeviceStore => {
  let device: GPUDevice | null = null;
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
      .catch((error) => {
        onError(error);
        return null;
      })
      .then((nextDevice) => {
        if (devicePromise !== pendingDevice) return nextDevice;

        device = nextDevice;
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
    getSnapshot: () => device,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};

const sharedGPUDeviceStore = createGPUDeviceStore(async () => {
  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: 'high-performance',
  });
  if (!adapter) {
    throw new Error('[react-native-fast-confetti] WebGPU adapter unavailable');
  }
  return adapter.requestDevice();
});

const subscribeToNothing = () => () => {};
const getNullSnapshot = () => null;

/**
 * Borrows an injected device or lazily acquires the package-wide shared device.
 * Injected devices remain entirely owned by the caller.
 */
export const useGPUDevice = (injectedDevice?: GPUDevice) => {
  const useSharedDevice = injectedDevice === undefined;
  const sharedDevice = useSyncExternalStore(
    useSharedDevice ? sharedGPUDeviceStore.subscribe : subscribeToNothing,
    useSharedDevice ? sharedGPUDeviceStore.getSnapshot : getNullSnapshot,
    getNullSnapshot
  );

  useEffect(() => {
    if (!useSharedDevice) return;
    void sharedGPUDeviceStore.acquire();
  }, [useSharedDevice]);

  return injectedDevice ?? sharedDevice;
};
