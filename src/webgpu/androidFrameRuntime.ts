import { Platform } from 'react-native';
import { installWebGPU } from 'react-native-webgpu';
import {
  createSynchronizable,
  createWorkletRuntime,
  scheduleOnRuntime,
  scheduleOnRN,
  scheduleOnUI,
} from 'react-native-worklets';

let androidRuntime: ReturnType<typeof createAndroidRuntime> | undefined;

const createAndroidRuntime = () => ({
  runtime: createWorkletRuntime({
    name: 'Confetti GPU',
    enableEventLoop: false,
    initializer: () => {
      'worklet';
      installWebGPU();
    },
  }),
  framePending: createSynchronizable(false),
});

export const getAndroidFrameRuntime = () =>
  Platform.OS === 'android'
    ? (androidRuntime ??= createAndroidRuntime())
    : null;

/** Keep swapchain configuration and retirement on the frame's owning queue. */
export const scheduleOnGPUFrameRuntime = <Args extends unknown[]>(
  operation: (...args: Args) => void,
  ...args: Args
) => {
  if (Platform.OS === 'web') {
    operation(...args);
    return;
  }
  const android = getAndroidFrameRuntime();
  if (android) scheduleOnRuntime(android.runtime, operation, ...args);
  else scheduleOnUI(operation, ...args);
};

const acknowledgeGPUOperations = (complete: () => void) => {
  'worklet';
  scheduleOnRN(complete);
};

/** A FIFO boundary after the owner's previously queued frames and removals. */
export const waitForGPUFrameRuntime = () => {
  if (Platform.OS === 'web') return Promise.resolve();
  return new Promise<void>((resolve) => {
    scheduleOnGPUFrameRuntime(acknowledgeGPUOperations, resolve);
  });
};
