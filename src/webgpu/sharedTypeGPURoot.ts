import { tgpu, type TgpuRoot } from 'typegpu';

// A TypeGPU root memoizes the raw bind-group layouts used by its pipelines.
// Recreating a root for every canvas gives otherwise identical pipelines new
// layout identities, which defeats Dawn/Metal pipeline reuse and retains a few
// megabytes of compiled state after every mount. The device is the real owner;
// the WeakMap lets the complete graph disappear when that device does.
const roots = new WeakMap<GPUDevice, TgpuRoot>();

export const getSharedTypeGPURoot = (device: GPUDevice) => {
  const cached = roots.get(device);
  if (cached) return cached;

  const root = tgpu.initFromDevice({ device, unstable_names: 'strict' });
  roots.set(device, root);
  return root;
};
