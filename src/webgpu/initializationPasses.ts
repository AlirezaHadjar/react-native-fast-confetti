type FallingInitialization = {
  initPipeline: GPUComputePipeline;
  runtimeInitPipeline: GPUComputePipeline;
  initBindGroup: GPUBindGroup;
  workgroupCount: number;
};

/** Records the spawn producer before the runtime-state consumer. */
export const recordFallingInitialization = (
  encoder: GPUCommandEncoder,
  state: FallingInitialization
) => {
  'worklet';
  const spawnPass = encoder.beginComputePass();
  spawnPass.setPipeline(state.initPipeline);
  spawnPass.setBindGroup(0, state.initBindGroup);
  spawnPass.dispatchWorkgroups(state.workgroupCount);
  spawnPass.end();

  // Keep this dependency across a pass boundary. On the Android Vulkan path,
  // switching these kernels inside one pass left the runtime buffer zeroed.
  const runtimePass = encoder.beginComputePass();
  runtimePass.setPipeline(state.runtimeInitPipeline);
  runtimePass.setBindGroup(0, state.initBindGroup);
  runtimePass.dispatchWorkgroups(state.workgroupCount);
  runtimePass.end();
};
