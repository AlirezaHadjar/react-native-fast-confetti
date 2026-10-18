import { waitForGPUFrameRuntime } from './androidFrameRuntime';

type Destroyable = {
  destroy: () => void;
};

type GPUResourceSet = {
  buffers: readonly Destroyable[];
  textures: readonly Destroyable[];
};

export type GPUFrameRetirement = {
  promise: Promise<void>;
  resolve: () => void;
};

const destroyAll = (resources: readonly Destroyable[]) => {
  for (const resource of resources) {
    try {
      resource.destroy();
    } catch {
      // Device loss can race teardown. The resource is already unusable then.
    }
  }
};

export const destroyGPUResourceSet = ({
  buffers,
  textures,
}: GPUResourceSet) => {
  destroyAll(buffers);
  destroyAll(textures);
};

export const createGPUFrameRetirement = (): GPUFrameRetirement => {
  let settled = false;
  let settle!: () => void;
  const promise = new Promise<void>((resolve) => {
    settle = resolve;
  });

  return {
    promise,
    resolve: () => {
      if (settled) return;
      settled = true;
      settle();
    },
  };
};

export const retireGPUResourceSet = async (
  destroy: () => void | Promise<void>,
  frameRetired?: Promise<void>
) => {
  // Layout cleanup queues removal before passive resource cleanup. The owner
  // barrier covers every callback incarnation, including a mount that
  // disappeared before its first registration.
  try {
    await frameRetired;
    await waitForGPUFrameRuntime();
    // Future initialization/writes use this device's same queue, so they follow
    // all retired submissions. Dawn also defers destroyed allocations until
    // their queued uses finish; no CPU readback requires a completion fence.
  } catch {
    // Runtime invalidation can race teardown. Its callbacks can no longer
    // submit work, so resource cleanup must still continue.
  } finally {
    await destroy();
  }
};
