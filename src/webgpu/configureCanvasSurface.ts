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
