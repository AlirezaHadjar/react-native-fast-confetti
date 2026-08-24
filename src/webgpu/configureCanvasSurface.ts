import { Platform } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import { installWebGPU } from 'react-native-webgpu';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';

type PresentableCanvasContext = GPUCanvasContext & {
  present?: () => void;
};

type CanvasSurface = {
  width: number;
  height: number;
};

const configureCanvasSurfaceOnUI = (
  context: PresentableCanvasContext,
  device: GPUDevice,
  width: number,
  height: number,
  format: GPUTextureFormat,
  ready: SharedValue<boolean>,
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

const unconfigureCanvasSurfaceOnUI = (
  context: PresentableCanvasContext,
  ready: SharedValue<boolean>
) => {
  'worklet';
  ready.set(false);
  try {
    context.unconfigure();
  } catch {
    // The native canvas can disappear before React's passive cleanup runs.
  }
};

/**
 * Configures the native CAMetalLayer from the main/UI runtime. Dawn mutates
 * that layer while configuring a swapchain, which UIKit explicitly forbids
 * from React Native's background JavaScript thread. Web has no such split.
 */
export const configureCanvasSurface = (
  context: PresentableCanvasContext,
  device: GPUDevice,
  width: number,
  height: number,
  format: GPUTextureFormat,
  ready: SharedValue<boolean>,
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

  // Keep this queued. On Android, the JS canvas object can arrive before the
  // backing SurfaceView has completed surfaceCreated; synchronous UI dispatch
  // would configure a swapchain that never becomes presentable.
  scheduleOnUI(
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
  ready: SharedValue<boolean>
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
  scheduleOnUI(unconfigureCanvasSurfaceOnUI, context, ready);
};
