type Destroyable = {
  destroy: () => void;
};

type GPUResourceSet = {
  buffers: readonly Destroyable[];
  textures: readonly Destroyable[];
  root: Destroyable;
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

export const retireGPUResourceSet = (destroy: () => void) => {
  return () => {
    // Frame-registry retirement is queued on the UI runtime during the same
    // React cleanup pass. Give it one turn to drop its cross-runtime references
    // before destroying buffers that its final submitted command may still use.
    setTimeout(destroy, 100);
  };
};
