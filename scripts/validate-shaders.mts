/// <reference types="node" />
import { create, globals } from 'webgpu';

import type { CompiledProgram } from '../src/webgpu/gpuProgram';

// Loads the shipped runtime sources as-is through Node's type stripping.
const { burstProgram, confettiProgram } = (await import(
  new URL('../src/webgpu/compiledShaders.ts', import.meta.url).href
)) as typeof import('../src/webgpu/compiledShaders');
const { createBindGroup, getComputePipeline, getRenderPipeline } =
  (await import(
    new URL('../src/webgpu/gpuProgram.ts', import.meta.url).href
  )) as typeof import('../src/webgpu/gpuProgram');

const PRESENTATION_FORMATS: GPUTextureFormat[] = ['bgra8unorm', 'rgba8unorm'];
const BUFFER_BYTES = 4096;

Object.assign(globalThis, globals);
// Keep the GPU object referenced: if it is collected, Dawn tears down under the device.
const gpu = create([]);
// CI runners only expose a software Vulkan device, which Dawn offers as a fallback.
const adapter =
  (await gpu.requestAdapter()) ??
  (await gpu.requestAdapter({ forceFallbackAdapter: true }));
if (!adapter) {
  throw new Error('No WebGPU adapter: install a Vulkan or Metal driver');
}
const device = await adapter.requestDevice();
const uncaptured: string[] = [];
device.addEventListener('uncapturederror', (event) => {
  uncaptured.push((event as GPUUncapturedErrorEvent).error.message);
});
console.log(
  `Validating with Dawn on ${adapter.info.vendor} ${adapter.info.architecture} (${adapter.info.description})`
);

const failures: string[] = [];
const expectNoErrors = async (label: string, action: () => void) => {
  device.pushErrorScope('validation');
  device.pushErrorScope('internal');
  device.pushErrorScope('out-of-memory');
  action();
  for (const scope of ['out-of-memory', 'internal', 'validation']) {
    const error = await device.popErrorScope();
    if (error) failures.push(`${label} (${scope}): ${error.message}`);
  }
};

const resourcesFor = (program: CompiledProgram, layoutName: string) => {
  const layout = program.layouts[layoutName]!;
  return Object.fromEntries(
    layout.entries.map((entry, index) => {
      const key = layout.keys[index]!;
      if (entry.buffer) {
        return [
          key,
          device.createBuffer({
            size: BUFFER_BYTES,
            usage:
              entry.buffer.type === 'uniform'
                ? GPUBufferUsage.UNIFORM
                : GPUBufferUsage.STORAGE,
          }),
        ];
      }
      if (entry.sampler) return [key, device.createSampler()];
      return [
        key,
        device
          .createTexture({
            size: [1, 1, 1],
            format: 'rgba8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING,
          })
          .createView({ dimension: entry.texture?.viewDimension }),
      ];
    })
  );
};

const validateProgram = async (name: string, program: CompiledProgram) => {
  for (const [index, code] of program.shaders.entries()) {
    const module = device.createShaderModule({ code });
    const { messages } = await module.getCompilationInfo();
    for (const message of messages) {
      failures.push(
        `${name} shader ${index} ${message.type} at ${message.lineNum}:${message.linePos}: ${message.message}`
      );
    }
  }

  for (const [pipelineName, spec] of Object.entries(program.pipelines)) {
    const formats = spec.kind === 'render' ? PRESENTATION_FORMATS : [null];
    for (const format of formats) {
      const label = `${name}.${pipelineName}${format ? ` (${format})` : ''}`;
      await expectNoErrors(label, () => {
        const bindGroups = spec.layouts.map((layoutName) =>
          createBindGroup(
            device,
            program,
            layoutName,
            resourcesFor(program, layoutName)
          )
        );
        const encoder = device.createCommandEncoder();
        if (spec.kind === 'compute') {
          const pass = encoder.beginComputePass();
          pass.setPipeline(getComputePipeline(device, program, pipelineName));
          bindGroups.forEach((group, slot) => pass.setBindGroup(slot, group));
          pass.dispatchWorkgroups(1);
          pass.end();
        } else {
          const target = device.createTexture({
            size: [4, 4],
            format: format!,
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
          });
          const pass = encoder.beginRenderPass({
            colorAttachments: [
              {
                view: target.createView(),
                loadOp: 'clear',
                storeOp: 'store',
              },
            ],
          });
          pass.setPipeline(
            getRenderPipeline(device, program, pipelineName, format!)
          );
          bindGroups.forEach((group, slot) => pass.setBindGroup(slot, group));
          pass.draw(4, 1);
          pass.end();
        }
        device.queue.submit([encoder.finish()]);
      });
    }
  }
};

await validateProgram('confetti', confettiProgram);
await validateProgram('burst', burstProgram);
await device.queue.onSubmittedWorkDone();
failures.push(...uncaptured.map((message) => `uncaptured: ${message}`));
device.destroy();

const pipelineCount =
  Object.keys(confettiProgram.pipelines).length +
  Object.keys(burstProgram.pipelines).length;
if (failures.length > 0) {
  console.error(`Shader validation failed:\n${failures.join('\n')}`);
  process.exit(1);
}
console.log(
  `All ${pipelineCount} compiled pipelines compiled, validated and executed on Dawn.`
);
process.exit(0);
