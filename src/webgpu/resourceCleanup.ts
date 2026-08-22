type Destroyable = {
  destroy: () => void;
};

type GPUResourceSet = {
  buffers: readonly Destroyable[];
  textures: readonly Destroyable[];
  root: Destroyable;
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
  root,
}: GPUResourceSet) => {
  destroyAll(buffers);
  destroyAll(textures);
  try {
    root.destroy();
  } catch {
    // TypeGPU can observe the device becoming lost during native teardown.
  }
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
  queue: GPUQueue,
  destroy: () => void,
  frameRetired?: Promise<void>
) => {
  // A resource can be destroyed only after the UI runtime has dropped the
  // callback that owns it and Dawn has completed every preceding submission.
  try {
    await frameRetired;
    await queue.onSubmittedWorkDone();
  } catch {
    // Device loss makes the completion fence reject; its resources are already
    // unusable, so teardown must continue and must not leak a rejection.
  } finally {
    destroy();
  }
};
