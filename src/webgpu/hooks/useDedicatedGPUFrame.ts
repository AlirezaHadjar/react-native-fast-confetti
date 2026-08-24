import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
  useFrameCallback,
  type FrameCallback,
  type FrameInfo,
} from 'react-native-reanimated';
import { installWebGPU } from 'react-native-webgpu';
import { runOnUISync } from 'react-native-worklets';

export type DedicatedGPUFrameTarget = {
  descriptor: GPURenderPassDescriptor;
  colorAttachment: GPURenderPassColorAttachment;
};

type PresentableCanvasContext = GPUCanvasContext & { present?: () => void };

export type DedicatedGPUFrameState = {
  device: GPUDevice;
  queue: GPUQueue;
  context: PresentableCanvasContext;
};

type DedicatedGPUFrameCallback<State extends DedicatedGPUFrameState> = (
  timestamp: number,
  timeSinceFirstFrame: number,
  target: DedicatedGPUFrameTarget,
  state: State
) => GPUCommandBuffer | null | undefined;
type ShouldScheduleGPUFrame = () => boolean;

type UIFrameEntry = {
  callback: DedicatedGPUFrameCallback<DedicatedGPUFrameState>;
  shouldSchedule: ShouldScheduleGPUFrame;
  state: DedicatedGPUFrameState;
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
}

const registerGPUFrameOnUI = <State extends DedicatedGPUFrameState>(
  key: string,
  callback: DedicatedGPUFrameCallback<State>,
  shouldSchedule: ShouldScheduleGPUFrame,
  state: State
) => {
  'worklet';
  const registry =
    globalThis.__fastConfettiUIFrameRegistryV5 ??
    (globalThis.__fastConfettiUIFrameRegistryV5 = new Map());
  registry.set(key, {
    callback:
      callback as unknown as DedicatedGPUFrameCallback<DedicatedGPUFrameState>,
    shouldSchedule,
    state,
    // Allocate the submit sequence once in its owning runtime. Only the
    // unavoidable native GPUCommandBuffer wrapper changes each frame.
    commandBuffers: [],
    target: createReusableFrameTarget(),
  });
};

const retireGPUFrameOnUI = (key: string) => {
  'worklet';
  const registry = globalThis.__fastConfettiUIFrameRegistryV5;
  const entry = registry?.get(key);
  if (entry) {
    entry.commandBuffers.length = 0;
    entry.target.colorAttachment.view = undefined as unknown as GPUTextureView;
    registry?.delete(key);
    return;
  }
  registry?.delete(key);
};

const commitGPUFrameSubmission = (
  queue: GPUQueue,
  context: PresentableCanvasContext,
  commandBuffer: GPUCommandBuffer,
  commandBuffers: GPUCommandBuffer[]
) => {
  'worklet';
  // Each native swapchain owns a pending Metal command buffer. Submit and
  // present must remain an adjacent pair for that exact surface.
  commandBuffers[0] = commandBuffer;
  try {
    queue.submit(commandBuffers);
    context.present?.();
  } finally {
    commandBuffers.length = 0;
  }
};

const dispatchGPUFrame = (entry: UIFrameEntry, frameInfo: FrameInfo) => {
  'worklet';
  try {
    const commandBuffer = entry.callback(
      frameInfo.timestamp,
      frameInfo.timeSinceFirstFrame,
      entry.target,
      entry.state
    );
    if (commandBuffer) {
      commitGPUFrameSubmission(
        entry.state.queue,
        entry.state.context,
        commandBuffer,
        entry.commandBuffers
      );
    }
  } finally {
    entry.target.colorAttachment.view = undefined as unknown as GPUTextureView;
  }
};

/**
 * Runs every native canvas from one UI-runtime vsync callback. React JavaScript
 * is absent from the frame path, while swapchain access remains on iOS's main
 * thread as required by CAMetalLayer. Physics itself stays in GPU compute.
 */
export const useDedicatedGPUFrame = <State extends DedicatedGPUFrameState>(
  callback: DedicatedGPUFrameCallback<State>,
  state: State | null,
  enabled = true,
  shouldSchedule?: ShouldScheduleGPUFrame,
  onRetired?: () => void
) => {
  const [surfaceId] = useState(() => nextSurfaceId++);
  const [webFrameTarget] = useState(createReusableFrameTarget);
  const generationRef = useRef(0);
  const webCommandBuffersRef = useRef<GPUCommandBuffer[]>([]);

  const canSchedule = useCallback(() => {
    'worklet';
    return shouldSchedule?.() ?? true;
  }, [shouldSchedule]);

  const scheduleNativeFrame = useCallback((frameInfo: FrameInfo) => {
    'worklet';
    const registry = globalThis.__fastConfettiUIFrameRegistryV5;
    if (!registry || registry.size === 0) return;

    if (!globalThis.__fastConfettiUIWebGPUInstalled) {
      installWebGPU();
      globalThis.__fastConfettiUIWebGPUInstalled = true;
    }

    // Every native canvas uses this one UI-runtime clock. Process them
    // sequentially so this library never operates on a device concurrently,
    // while still giving every surface one opportunity per display tick.
    for (const entry of registry.values()) {
      if (!entry.shouldSchedule()) continue;
      dispatchGPUFrame(entry, frameInfo);
    }
  }, []);

  const scheduleWebFrame = useCallback(
    (frameInfo: FrameInfo) => {
      'worklet';
      if (!enabled || !state || !canSchedule()) return;
      try {
        const commandBuffer = callback(
          frameInfo.timestamp,
          frameInfo.timeSinceFirstFrame,
          webFrameTarget,
          state
        );
        if (commandBuffer) {
          commitGPUFrameSubmission(
            state.queue,
            state.context,
            commandBuffer,
            webCommandBuffersRef.current
          );
        }
      } finally {
        webFrameTarget.colorAttachment.view =
          undefined as unknown as GPUTextureView;
      }
    },
    [callback, canSchedule, enabled, state, webFrameTarget]
  );

  // The native clock callback captures no canvas, resource, or user worklet.
  // GPU objects cross to UI only once when their registry entry is installed.
  const frameCallback = useFrameCallback(
    Platform.OS === 'web' ? scheduleWebFrame : scheduleNativeFrame,
    false
  );

  useLayoutEffect(() => {
    if (!enabled || !state) {
      frameCallback.setActive(false);
      return;
    }

    if (Platform.OS === 'web') {
      frameCallback.setActive(true);
      return () => {
        frameCallback.setActive(false);
        onRetired?.();
      };
    }

    generationRef.current += 1;
    const key = `${surfaceId}:${generationRef.current}`;
    // Registration and retirement must share one synchronous ordering domain.
    // An async registration can otherwise land after its cleanup and leave a
    // zombie entry holding every transferred GPU object indefinitely.
    runOnUISync(
      registerGPUFrameOnUI,
      key,
      callback,
      canSchedule,
      state
    );
    registerNativeClock(surfaceId, frameCallback);

    return () => {
      unregisterNativeClock(surfaceId);
      try {
        runOnUISync(retireGPUFrameOnUI, key);
      } finally {
        onRetired?.();
      }
    };
  }, [
    callback,
    canSchedule,
    enabled,
    frameCallback,
    state,
    surfaceId,
    onRetired,
  ]);
};
