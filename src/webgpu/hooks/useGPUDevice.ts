import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

let nextDeviceOwnerId = 1;
let iosDeviceOwner: number | undefined;
const iosDeviceWaiters = new Map<number, () => void>();
let warnedAboutMultipleIOSCanvases = false;

const acquireIOSDevice = (ownerId: number, connect: () => void) => {
  if (iosDeviceOwner === undefined) {
    iosDeviceOwner = ownerId;
    connect();
    return;
  }
  iosDeviceWaiters.set(ownerId, connect);
  if (__DEV__ && !warnedAboutMultipleIOSCanvases) {
    warnedAboutMultipleIOSCanvases = true;
    console.warn(
      '[react-native-fast-confetti] iOS currently permits one active GPU canvas. ' +
        'Use one full-screen confetti overlay; additional canvases wait until the owner unmounts.'
    );
  }
};

const releaseIOSDevice = (ownerId: number) => {
  iosDeviceWaiters.delete(ownerId);
  if (iosDeviceOwner !== ownerId) return;
  iosDeviceOwner = undefined;

  // Let the frame registry retire and Metal schedule the final presentation
  // before another CAMetalLayer starts recording. Explicit resource/device
  // destruction is intentionally avoided: RN WebGPU's cross-runtime native
  // finalizers are the safe owner of that lifecycle.
  setTimeout(() => {
    if (iosDeviceOwner !== undefined) return;
    const next = iosDeviceWaiters.entries().next().value as
      | [number, () => void]
      | undefined;
    if (!next) return;
    const [nextOwnerId, connect] = next;
    iosDeviceWaiters.delete(nextOwnerId);
    iosDeviceOwner = nextOwnerId;
    connect();
  }, 250);
};

/**
 * Creates the device owned by one canvas presentation surface.
 *
 * RN WebGPU's Dawn/Metal integration couples pending command recording to the
 * canvas swapchain, and its adapter wrapper is single-use. Each canvas receives
 * its own device on web/Android. iOS additionally serializes ownership because
 * the current bridge leaves an uncommitted Metal encoder when more than one
 * CAMetalLayer is live; one full-screen confetti instance remains unrestricted.
 */
export const useGPUDevice = () => {
  const [ownerId] = useState(() => nextDeviceOwnerId++);
  const [device, setDevice] = useState<GPUDevice | null>(null);

  useEffect(() => {
    let cancelled = false;
    let currentDevice: GPUDevice | null = null;

    const connect = async () => {
      try {
        const adapter = await navigator.gpu.requestAdapter({
          powerPreference: 'high-performance',
        });
        if (!adapter) {
          throw new Error(
            '[react-native-fast-confetti] WebGPU adapter unavailable'
          );
        }
        const nextDevice = await adapter.requestDevice();
        if (cancelled) return;
        currentDevice = nextDevice;
        setDevice(nextDevice);

        void nextDevice.lost.then(() => {
          if (cancelled || currentDevice !== nextDevice) return;
          currentDevice = null;
          setDevice(null);
          void connect();
        });
      } catch (error) {
        if (!cancelled) console.error(error);
      }
    };

    if (Platform.OS === 'ios') {
      acquireIOSDevice(ownerId, () => void connect());
    } else {
      void connect();
    }
    return () => {
      cancelled = true;
      currentDevice = null;
      if (Platform.OS === 'ios') releaseIOSDevice(ownerId);
    };
  }, [ownerId]);

  return device;
};
