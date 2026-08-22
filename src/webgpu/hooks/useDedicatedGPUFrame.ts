import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
  useFrameCallback,
  type FrameCallback,
  type FrameInfo,
} from 'react-native-reanimated';
import { installWebGPU } from 'react-native-webgpu';
import { scheduleOnUI } from 'react-native-worklets';

export type DedicatedGPUFrameTarget = {
  descriptor: GPURenderPassDescriptor;
  colorAttachment: GPURenderPassColorAttachment;
};

type PresentableCanvasContext = GPUCanvasContext & { present?: () => void };

type DedicatedGPUFrameCallback = (
  timestamp: number,
  timeSinceFirstFrame: number,
  target: DedicatedGPUFrameTarget
) => GPUCommandBuffer | null | undefined;
type ShouldScheduleGPUFrame = () => boolean;

type UIFrameEntry = {
  callback: DedicatedGPUFrameCallback;
  shouldSchedule: ShouldScheduleGPUFrame;
  device: GPUDevice;
  context: PresentableCanvasContext;
  commandBuffers: GPUCommandBuffer[];
  target: DedicatedGPUFrameTarget;
};
type UIFrameRegistry = Map<string, UIFrameEntry>;

let nextSurfaceId = 1;
const nativeClockRegistrations = new Map<number, FrameCallback>();
let nativeClockOwner: number | undefined;

const createReusableFrameTarget = (): DedicatedGPUFrameTarget => {
  'worklet';
  const colorAttachment: GPURenderPassColorAttachment = {
    // Replaced with the current swapchain view immediately before every pass.
    view: undefined as unknown as GPUTextureView,
    clearValue: [0, 0, 0, 0],
    loadOp: 'clear',
    storeOp: 'store',
  };
  return {
    colorAttachment,
    descriptor: { colorAttachments: [colorAttachment] },
  };
};

const electNativeClockOwner = () => {
  const nextOwner = nativeClockRegistrations.keys().next().value as
    | number
    | undefined;
  if (nativeClockOwner === nextOwner) return;

  if (nativeClockOwner !== undefined) {
    nativeClockRegistrations.get(nativeClockOwner)?.setActive(false);
  }
  nativeClockOwner = nextOwner;
  if (nextOwner !== undefined) {
    nativeClockRegistrations.get(nextOwner)?.setActive(true);
  }
};

const registerNativeClock = (
  surfaceId: number,
  frameCallback: FrameCallback
) => {
  nativeClockRegistrations.set(surfaceId, frameCallback);
  electNativeClockOwner();
};

const unregisterNativeClock = (surfaceId: number) => {
  nativeClockRegistrations.get(surfaceId)?.setActive(false);
  nativeClockRegistrations.delete(surfaceId);
  if (nativeClockOwner === surfaceId) nativeClockOwner = undefined;
  electNativeClockOwner();
};

declare global {
  // This registry exists only in the Reanimated UI runtime.
  var __fastConfettiUIFrameRegistryV5: UIFrameRegistry | undefined;
  var __fastConfettiUIWebGPUInstalled: boolean | undefined;
  var __fastConfettiUIFrameCursorV4: string | undefined;
}

const registerGPUFrameOnUI = (
  key: string,
  callback: DedicatedGPUFrameCallback,
  shouldSchedule: ShouldScheduleGPUFrame,
  device: GPUDevice,
  context: PresentableCanvasContext
) => {
  'worklet';
  const registry =
    globalThis.__fastConfettiUIFrameRegistryV5 ??
    (globalThis.__fastConfettiUIFrameRegistryV5 = new Map());
  registry.set(key, {
    callback,
    shouldSchedule,
    device,
    context,
    // Allocate the submit sequence once in its owning runtime. Only the
    // unavoidable native GPUCommandBuffer wrapper changes each frame.
    commandBuffers: [],
    target: createReusableFrameTarget(),
  });
};

const retireGPUFrameOnUI = (key: string) => {
  'worklet';
  const registry = globalThis.__fastConfettiUIFrameRegistryV5;
  registry?.delete(key);
  if (globalThis.__fastConfettiUIFrameCursorV4 === key) {
    globalThis.__fastConfettiUIFrameCursorV4 = undefined;
  }
};

const commitGPUFrameSubmission = (
  device: GPUDevice,
  context: PresentableCanvasContext,
  commandBuffer: GPUCommandBuffer,
  commandBuffers: GPUCommandBuffer[]
) => {
  'worklet';
  // Each native swapchain owns a pending Metal command buffer. Submit and
  // present must remain an adjacent pair for that exact surface.
  commandBuffers[0] = commandBuffer;
  device.queue.submit(commandBuffers);
  context.present?.();
};

const dispatchGPUFrame = (entry: UIFrameEntry, frameInfo: FrameInfo) => {
  'worklet';
  const commandBuffer = entry.callback(
    frameInfo.timestamp,
    frameInfo.timeSinceFirstFrame,
    entry.target
  );
  if (commandBuffer) {
    commitGPUFrameSubmission(
      entry.device,
      entry.context,
      commandBuffer,
      entry.commandBuffers
    );
  }
};

/**
 * Runs every native canvas from one UI-runtime vsync callback. React JavaScript
 * is absent from the frame path, while swapchain access remains on iOS's main
 * thread as required by CAMetalLayer. Physics itself stays in GPU compute.
 */
export const useDedicatedGPUFrame = (
  callback: DedicatedGPUFrameCallback,
  device: GPUDevice | null,
  context: PresentableCanvasContext | null,
  enabled = true,
  shouldSchedule?: ShouldScheduleGPUFrame
) => {
  const [surfaceId] = useState(() => nextSurfaceId++);
  const [webFrameTarget] = useState(createReusableFrameTarget);
  const generationRef = useRef(0);
  const webCommandBuffersRef = useRef<GPUCommandBuffer[]>([]);
  const serializeNativeSwapchains = Platform.OS === 'ios';

  const canSchedule = useCallback(() => {
    'worklet';
    return shouldSchedule?.() ?? true;
  }, [shouldSchedule]);

  const scheduleNativeFrame = useCallback(
    (frameInfo: FrameInfo) => {
      'worklet';
      const registry = globalThis.__fastConfettiUIFrameRegistryV5;
      if (!registry || registry.size === 0) return;

      if (!globalThis.__fastConfettiUIWebGPUInstalled) {
        installWebGPU();
        globalThis.__fastConfettiUIWebGPUInstalled = true;
      }

      if (!serializeNativeSwapchains) {
        for (const entry of registry.values()) {
          if (!entry.shouldSchedule()) continue;
          dispatchGPUFrame(entry, frameInfo);
        }
        return;
      }

      // An iOS GPU canvas is a swapchain, not merely another draw target. The
      // RN WebGPU/Dawn Metal bridge cannot safely finish two swapchains inside a
      // single display-link callback (it corrupts the simulator command recording
      // context). Games avoid this by owning one presentation surface. Keep the
      // production fast path identical for one surface and fairly serialize the
      // exceptional multi-canvas case across vsyncs.
      const cursor = globalThis.__fastConfettiUIFrameCursorV4;
      let passedCursor = cursor === undefined;
      let firstEligibleKey: string | undefined;
      let firstEligibleEntry: UIFrameEntry | undefined;
      let selectedKey: string | undefined;
      let selectedEntry: UIFrameEntry | undefined;

      for (const [key, entry] of registry) {
        if (!entry.shouldSchedule()) continue;

        if (!firstEligibleEntry) {
          firstEligibleKey = key;
          firstEligibleEntry = entry;
        }
        if (passedCursor && key !== cursor) {
          selectedKey = key;
          selectedEntry = entry;
          break;
        }
        if (key === cursor) passedCursor = true;
      }

      selectedKey ??= firstEligibleKey;
      selectedEntry ??= firstEligibleEntry;
      if (!selectedEntry || selectedKey === undefined) return;

      globalThis.__fastConfettiUIFrameCursorV4 = selectedKey;
      dispatchGPUFrame(selectedEntry, frameInfo);
    },
    [serializeNativeSwapchains]
  );

  const scheduleWebFrame = useCallback(
    (frameInfo: FrameInfo) => {
      'worklet';
      if (!enabled || !device || !context || !canSchedule()) return;
      const commandBuffer = callback(
        frameInfo.timestamp,
        frameInfo.timeSinceFirstFrame,
        webFrameTarget
      );
      if (commandBuffer) {
        commitGPUFrameSubmission(
          device,
          context,
          commandBuffer,
          webCommandBuffersRef.current
        );
      }
    },
    [callback, canSchedule, context, device, enabled, webFrameTarget]
  );

  // The native clock callback captures no canvas, resource, or user worklet.
  // GPU objects cross to UI only once when their registry entry is installed.
  const frameCallback = useFrameCallback(
    Platform.OS === 'web' ? scheduleWebFrame : scheduleNativeFrame,
    false
  );

  useEffect(() => {
    if (!enabled || !device || !context) {
      frameCallback.setActive(false);
      return;
    }

    if (Platform.OS === 'web') {
      frameCallback.setActive(true);
      return () => frameCallback.setActive(false);
    }

    generationRef.current += 1;
    const key = `${surfaceId}:${generationRef.current}`;
    scheduleOnUI(
      registerGPUFrameOnUI,
      key,
      callback,
      canSchedule,
      device,
      context
    );
    registerNativeClock(surfaceId, frameCallback);

    return () => {
      unregisterNativeClock(surfaceId);
      scheduleOnUI(retireGPUFrameOnUI, key);
    };
  }, [
    callback,
    canSchedule,
    context,
    device,
    enabled,
    frameCallback,
    surfaceId,
  ]);
};
