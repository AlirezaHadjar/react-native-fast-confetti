import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
  useFrameCallback,
  type FrameCallback,
  type FrameInfo,
} from 'react-native-reanimated';
import { installWebGPU } from 'react-native-webgpu';
import { scheduleOnRN, scheduleOnRuntime } from 'react-native-worklets';
import {
  getAndroidFrameRuntime,
  scheduleOnGPUFrameRuntime,
} from '../androidFrameRuntime';

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

const registerNativeClock = (
  surfaceId: number,
  frameCallback: FrameCallback
) => {
  nativeClockRegistrations.set(surfaceId, frameCallback);
  frameCallback.setActive(true);
};

const unregisterNativeClock = (surfaceId: number) => {
  nativeClockRegistrations.get(surfaceId)?.setActive(false);
  nativeClockRegistrations.delete(surfaceId);
};

declare global {
  // Owned by the Android GPU worker or the iOS UI runtime.
  var __fastConfettiUIFrameRegistryV5: UIFrameRegistry | undefined;
  var __fastConfettiUIWebGPUInstalled: boolean | undefined;
  var __fastConfettiUILastFrameTimestampV5: number | undefined;
  var __fastConfettiWorkerDispatchV1:
    | ((frameInfo: FrameInfo) => void)
    | undefined;
}

const retireGPUFrameOnUI = (key: string, onRetired?: () => void) => {
  'worklet';
  const registry = globalThis.__fastConfettiUIFrameRegistryV5;
  const entry = registry?.get(key);
  if (entry) {
    entry.commandBuffers.length = 0;
    entry.target.colorAttachment.view = undefined as unknown as GPUTextureView;
    registry?.delete(key);
  } else {
    registry?.delete(key);
  }
  if (onRetired) scheduleOnRN(onRetired);
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

const dispatchRegisteredGPUFrames = (frameInfo: FrameInfo) => {
  'worklet';
  const registry = globalThis.__fastConfettiUIFrameRegistryV5;
  if (!registry || registry.size === 0) return;
  if (!globalThis.__fastConfettiUIWebGPUInstalled) {
    installWebGPU();
    globalThis.__fastConfettiUIWebGPUInstalled = true;
  }
  for (const entry of registry.values()) {
    if (!entry.shouldSchedule()) continue;
    dispatchGPUFrame(entry, frameInfo);
  }
};

const registerGPUFrameOnUI = <State extends DedicatedGPUFrameState>(
  key: string,
  callback: DedicatedGPUFrameCallback<State>,
  shouldSchedule: ShouldScheduleGPUFrame,
  state: State
) => {
  'worklet';
  // Install from RN directly into the owner. Capturing this function in a
  // UI-to-worker closure would serialize a worklet across two runtime hops.
  globalThis.__fastConfettiWorkerDispatchV1 = dispatchRegisteredGPUFrames;
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

/**
 * Uses one native vsync clock. Android GPU submission runs on its own worker
 * so TextureView consumption and navigation can continue on the UI thread.
 * iOS swapchain access stays on the main thread required by CAMetalLayer.
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

  const [androidFrameRuntime] = useState(getAndroidFrameRuntime);

  const scheduleNativeFrame = useCallback(
    (frameInfo: FrameInfo) => {
      'worklet';
      if (
        globalThis.__fastConfettiUILastFrameTimestampV5 === frameInfo.timestamp
      )
        return;
      globalThis.__fastConfettiUILastFrameTimestampV5 = frameInfo.timestamp;
      if (androidFrameRuntime) {
        const pending = androidFrameRuntime.framePending;
        // Never queue more than one GPU tick. A slow GPU drops ticks instead of
        // accumulating stale frames and blocking the view's consumer thread.
        if (pending.getBlocking()) return;
        pending.setBlocking(true);
        scheduleOnRuntime(androidFrameRuntime.runtime, () => {
          'worklet';
          try {
            globalThis.__fastConfettiWorkerDispatchV1?.(frameInfo);
          } finally {
            pending.setBlocking(false);
          }
        });
      } else {
        dispatchRegisteredGPUFrames(frameInfo);
      }
    },
    [androidFrameRuntime]
  );

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
  // GPU objects cross to their frame runtime only once at registration.
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
    // Worklets preserves FIFO ordering, so an immediate cleanup cannot race
    // ahead of this registration. Keeping the handoff asynchronous also avoids
    // blocking React commits on the UI thread.
    scheduleOnGPUFrameRuntime(
      registerGPUFrameOnUI,
      key,
      callback,
      canSchedule,
      state
    );
    registerNativeClock(surfaceId, frameCallback);

    return () => {
      unregisterNativeClock(surfaceId);
      scheduleOnGPUFrameRuntime(retireGPUFrameOnUI, key, onRetired);
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
