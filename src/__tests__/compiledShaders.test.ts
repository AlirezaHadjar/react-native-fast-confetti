import { describe, expect, it } from '@jest/globals';
import { d, tgpu } from 'typegpu';

import * as burst from '../../shaders/burstConfetti';
import * as confetti from '../../shaders/confetti';
import * as state from '../../shaders/physics/state';
import {
  burstLayouts,
  burstProgram,
  confettiLayouts,
  confettiProgram,
} from '../webgpu/compiledShaders';
import {
  createBindGroup,
  getComputePipeline,
  getRenderPipeline,
  packArray,
  packStruct,
  type ArrayLayout,
  type DataType,
  type StructType,
} from '../webgpu/gpuProgram';

Object.assign(globalThis, {
  GPUBufferUsage: {
    MAP_READ: 0x1,
    MAP_WRITE: 0x2,
    COPY_SRC: 0x4,
    COPY_DST: 0x8,
    INDEX: 0x10,
    VERTEX: 0x20,
    UNIFORM: 0x40,
    STORAGE: 0x80,
    INDIRECT: 0x100,
    QUERY_RESOLVE: 0x200,
  },
});

type Schema = Parameters<typeof d.sizeOf>[0];
type ArraySchema = (count: number) => Schema;

const structPairs: [StructType, Schema][] = [
  [confettiLayouts.uniforms, confetti.UniformsSchema],
  [confettiLayouts.initUniforms, confetti.InitUniformsSchema],
  [burstLayouts.uniforms, burst.BurstUniformsSchema],
  [burstLayouts.initUniforms, burst.BurstInitUniformsSchema],
];
const arrayPairs: [ArrayLayout, ArraySchema][] = [
  [confettiLayouts.sizes, confetti.SizeArraySchema],
  [confettiLayouts.initSizes, confetti.InitSizeArraySchema],
  [confettiLayouts.palette, confetti.PaletteArraySchema],
  [confettiLayouts.spawns, state.ParticleSpawnArraySchema],
  [confettiLayouts.runtime, state.ParticleRuntimeArraySchema],
  [burstLayouts.particles, burst.BurstParticleArraySchema],
  [burstLayouts.runtime, burst.BurstRuntimeArraySchema],
  [burstLayouts.transforms, burst.BurstTransformArraySchema],
  [burstLayouts.origins, burst.BurstOriginArraySchema],
  [burstLayouts.initSizes, burst.BurstInitSizeArraySchema],
  [burstLayouts.sizes, burst.BurstSizeArraySchema],
  [burstLayouts.palette, burst.BurstPaletteArraySchema],
  [burstLayouts.opacityKeyframes, burst.BurstOpacityKeyframeArraySchema],
];

let seed = 1;
const sampleValue = (type: DataType): unknown => {
  if (typeof type !== 'string') {
    return Object.fromEntries(
      type.fields.map(([name, , fieldType]) => [name, sampleValue(fieldType)])
    );
  }
  const count = Number(type.match(/^vec(\d)/)?.[1] ?? 1);
  const components = Array.from({ length: count }, () =>
    type.endsWith('f') || type === 'f32' ? seed++ * 0.25 - 7 : seed++ * 3
  );
  return count === 1 ? components[0] : components;
};

const writtenBytes = (schema: Schema, value: unknown) => {
  let written: Uint8Array | null = null;
  const device = {
    queue: {
      writeBuffer: (
        _buffer: unknown,
        offset: number,
        data: ArrayBufferView | ArrayBuffer,
        dataOffset = 0,
        size?: number
      ) => {
        const source =
          data instanceof ArrayBuffer
            ? new Uint8Array(data)
            : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        written = new Uint8Array(d.sizeOf(schema));
        written.set(
          source.subarray(dataOffset, dataOffset + (size ?? source.length)),
          offset
        );
      },
    },
    createBuffer: (descriptor: GPUBufferDescriptor) => ({
      ...descriptor,
      mapState: 'unmapped',
    }),
  };
  const root = tgpu.initFromDevice({ device: device as unknown as GPUDevice });
  const buffer = root.createBuffer(schema as never);
  buffer.write(value as never);
  return written!;
};

describe('compiled shaders', () => {
  it('keep every buffer layout identical to the TypeGPU schemas', () => {
    for (const [layout, schema] of structPairs) {
      expect(layout.size).toBe(d.sizeOf(schema));
      for (const [name, offset] of layout.fields) {
        expect(
          d.memoryLayoutOf(schema as never, (value: never) => value[name])
            .offset
        ).toBe(offset);
      }
    }
    for (const [layout, arraySchema] of arrayPairs) {
      expect(layout.stride * 3).toBe(d.sizeOf(arraySchema(3)));
    }
  });

  it('pack bytes exactly like TypeGPU writes them', () => {
    for (const [layout, schema] of structPairs) {
      const value = sampleValue(layout) as object;
      expect(new Uint8Array(packStruct(layout, value))).toEqual(
        writtenBytes(schema, value)
      );
    }
    for (const [layout, arraySchema] of arrayPairs) {
      const values = [0, 1, 2].map(() => sampleValue(layout.element));
      expect(new Uint8Array(packArray(layout, values))).toEqual(
        writtenBytes(arraySchema(3), values)
      );
    }
  });

  it('cache pipelines per device and format and share bind group layouts', () => {
    const created: { kind: string; descriptor: Record<string, unknown> }[] = [];
    const record = (kind: string) => (descriptor: Record<string, unknown>) => {
      const handle = { kind, descriptor };
      created.push(handle);
      return handle;
    };
    const makeDevice = () =>
      ({
        createShaderModule: record('shader'),
        createBindGroupLayout: record('bindGroupLayout'),
        createPipelineLayout: record('pipelineLayout'),
        createComputePipeline: record('compute'),
        createRenderPipeline: record('render'),
        createBindGroup: record('bindGroup'),
      }) as unknown as GPUDevice;
    const first = makeDevice();
    const second = makeDevice();

    const render = getRenderPipeline(
      first,
      confettiProgram,
      'renderPipeline',
      'bgra8unorm'
    );
    expect(
      getRenderPipeline(first, confettiProgram, 'renderPipeline', 'bgra8unorm')
    ).toBe(render);
    expect(
      getRenderPipeline(first, confettiProgram, 'renderPipeline', 'rgba8unorm')
    ).not.toBe(render);
    expect(
      getRenderPipeline(second, confettiProgram, 'renderPipeline', 'bgra8unorm')
    ).not.toBe(render);
    expect(getComputePipeline(first, burstProgram, 'initPipeline')).toBe(
      getComputePipeline(first, burstProgram, 'initPipeline')
    );

    const renderLayout = (
      (render as unknown as { descriptor: { layout: unknown } }).descriptor
        .layout as { descriptor: { bindGroupLayouts: unknown[] } }
    ).descriptor.bindGroupLayouts[0];
    const bindGroup = createBindGroup(first, confettiProgram, 'renderLayout', {
      uniforms: {} as GPUBuffer,
      spawns: {} as GPUBuffer,
      runtime: {} as GPUBuffer,
      sizes: {} as GPUBuffer,
      palette: {} as GPUBuffer,
      sampler: {} as GPUSampler,
      textures: {} as GPUTextureView,
      shapeMasks: {} as GPUTextureView,
    }) as unknown as { descriptor: GPUBindGroupDescriptor };
    expect(bindGroup.descriptor.layout).toBe(renderLayout);
    expect(
      (bindGroup.descriptor.entries as GPUBindGroupEntry[]).map((entry) =>
        'buffer' in (entry.resource as object) ? 'buffer' : 'other'
      )
    ).toEqual([
      'buffer',
      'buffer',
      'buffer',
      'buffer',
      'buffer',
      'other',
      'other',
      'other',
    ]);
  });
});
