import { Platform } from 'react-native';
import type { WritableValue } from './controlValues';
import { installWebGPU } from 'react-native-webgpu';
import { scheduleOnRN } from 'react-native-worklets';
import { scheduleOnGPUFrameRuntime } from './androidFrameRuntime';
import { runOrDeferGPUOperationOnUI } from './gpuRuntimeOwnership';

type PresentableCanvasContext = GPUCanvasContext & {
  present?: () => void;
};

type CanvasSurface = {
  width: number;
  height: number;
};

const performConfigureCanvasSurfaceOnUI = (
  context: PresentableCanvasContext,
  device: GPUDevice,
  width: number,
  height: number,
  format: GPUTextureFormat,
  ready: WritableValue<boolean>,
  onConfigured?: () => void
) => {
  'worklet';
  installWebGPU();

  const canvas = context.canvas as unknown as CanvasSurface;
  canvas.width = width;
  canvas.height = height;
  context.configure({
    device,
    format,
    alphaMode: 'premultiplied',
  });
  ready.set(true);
  if (onConfigured) scheduleOnRN(onConfigured);
};

const configureCanvasSurfaceOnUI = (
  context: PresentableCanvasContext,
  device: GPUDevice,
  width: number,
  height: number,
  format: GPUTextureFormat,
  ready: WritableValue<boolean>,
  onConfigured?: () => void
) => {
  'worklet';
  runOrDeferGPUOperationOnUI(() => {
    'worklet';
    performConfigureCanvasSurfaceOnUI(
      context,
      device,
      width,
      height,
      format,
      ready,
      onConfigured
    );
  });
};

const performUnconfigureCanvasSurfaceOnUI = (
  context: PresentableCanvasContext,
  ready: WritableValue<boolean>
) => {
  'worklet';
  ready.set(false);
  try {
    context.unconfigure();
  } catch {
    // The native canvas can disappear before React's passive cleanup runs.
  }
};

const unconfigureCanvasSurfaceOnUI = (
  context: PresentableCanvasContext,
  ready: WritableValue<boolean>
) => {
  'worklet';
  runOrDeferGPUOperationOnUI(() => {
    'worklet';
    performUnconfigureCanvasSurfaceOnUI(context, ready);
  });
};

/**
 * Configures Android on its GPU worker and CAMetalLayer on the UI runtime.
 * Dawn mutates
 * that layer while configuring a swapchain, which UIKit explicitly forbids
 * from React Native's background JavaScript thread. Web has no such split.
 */
export const configureCanvasSurface = (
  context: PresentableCanvasContext,
  device: GPUDevice,
  width: number,
  height: number,
  format: GPUTextureFormat,
  ready: WritableValue<boolean>,
  onConfigured?: () => void
) => {
  ready.set(false);

  if (Platform.OS === 'web') {
    const canvas = context.canvas as unknown as CanvasSurface;
    canvas.width = width;
    canvas.height = height;
    context.configure({
      device,
      format,
      alphaMode: 'premultiplied',
    });
    ready.set(true);
    onConfigured?.();
    return;
  }

  // Queue on the same runtime as frame submission and retirement. On Android,
  // the JS canvas can arrive before its native surface has been attached.
  scheduleOnGPUFrameRuntime(
    configureCanvasSurfaceOnUI,
    context,
    device,
    width,
    height,
    format,
    ready,
    onConfigured
  );
};

export const unconfigureCanvasSurface = (
  context: PresentableCanvasContext,
  ready: WritableValue<boolean>
) => {
  ready.set(false);
  if (Platform.OS === 'web') {
    try {
      context.unconfigure();
    } catch {
      // The browser may already have detached the canvas.
    }
    return;
  }
  scheduleOnGPUFrameRuntime(unconfigureCanvasSurfaceOnUI, context, ready);
};
