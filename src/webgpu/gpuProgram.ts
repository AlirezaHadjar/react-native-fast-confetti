export type ScalarOrVectorType =
  | 'f32'
  | 'u32'
  | 'i32'
  | 'vec2f'
  | 'vec3f'
  | 'vec4f'
  | 'vec2u'
  | 'vec3u'
  | 'vec4u'
  | 'vec2i'
  | 'vec3i'
  | 'vec4i';

export type StructType = {
  size: number;
  fields: readonly (readonly [name: string, offset: number, type: DataType])[];
};

export type DataType = ScalarOrVectorType | StructType;

export type ArrayLayout = { stride: number; element: DataType };

export type BindGroupLayoutSpec = {
  label: string;
  keys: readonly string[];
  entries: readonly GPUBindGroupLayoutEntry[];
};

export type PipelineSpec =
  | {
      kind: 'compute';
      label: string;
      layouts: readonly string[];
      shader: number;
    }
  | {
      kind: 'render';
      label: string;
      layouts: readonly string[];
      vertexShader: number;
      fragmentShader: number;
      targets: readonly Omit<GPUColorTargetState, 'format'>[];
      primitive: GPUPrimitiveState;
    };

export type CompiledProgram = {
  shaders: readonly string[];
  layouts: Readonly<Record<string, BindGroupLayoutSpec>>;
  pipelines: Readonly<Record<string, PipelineSpec>>;
};

export type BindGroupResource = GPUBuffer | GPUSampler | GPUTextureView;

const COMPONENTS: Record<
  ScalarOrVectorType,
  [count: number, kind: 'f' | 'u' | 'i']
> = {
  f32: [1, 'f'],
  u32: [1, 'u'],
  i32: [1, 'i'],
  vec2f: [2, 'f'],
  vec3f: [3, 'f'],
  vec4f: [4, 'f'],
  vec2u: [2, 'u'],
  vec3u: [3, 'u'],
  vec4u: [4, 'u'],
  vec2i: [2, 'i'],
  vec3i: [3, 'i'],
  vec4i: [4, 'i'],
};
const VECTOR_KEYS = ['x', 'y', 'z', 'w'] as const;

const writeData = (
  view: DataView,
  offset: number,
  type: DataType,
  value: unknown
) => {
  if (typeof type !== 'string') {
    const record = value as Record<string, unknown>;
    for (const [name, fieldOffset, fieldType] of type.fields) {
      writeData(view, offset + fieldOffset, fieldType, record[name]);
    }
    return;
  }
  const [count, kind] = COMPONENTS[type];
  for (let index = 0; index < count; index++) {
    const component =
      count === 1
        ? (value as number)
        : ((value as Record<number | string, number>)[index] ??
          (value as Record<string, number>)[VECTOR_KEYS[index]!]);
    const at = offset + index * 4;
    if (kind === 'f') view.setFloat32(at, component ?? 0, true);
    else if (kind === 'u') view.setUint32(at, component ?? 0, true);
    else view.setInt32(at, component ?? 0, true);
  }
};

export const packStruct = (type: StructType, value: object): ArrayBuffer => {
  const bytes = new ArrayBuffer(type.size);
  writeData(new DataView(bytes), 0, type, value);
  return bytes;
};

export const packArray = (
  layout: ArrayLayout,
  values: readonly unknown[],
  count = values.length
): ArrayBuffer => {
  const bytes = new ArrayBuffer(layout.stride * count);
  const view = new DataView(bytes);
  values.forEach((value, index) =>
    writeData(view, index * layout.stride, layout.element, value)
  );
  return bytes;
};

export const createGPUBuffer = (
  device: GPUDevice,
  usage: number,
  size: number,
  data?: ArrayBuffer
): GPUBuffer => {
  const buffer = device.createBuffer({ size, usage });
  if (data) device.queue.writeBuffer(buffer, 0, data);
  return buffer;
};

// Per-device reuse keeps Dawn/Metal pipeline caches warm across canvas remounts.
const layoutCache = new WeakMap<
  GPUDevice,
  Map<BindGroupLayoutSpec, GPUBindGroupLayout>
>();
const shaderCache = new WeakMap<GPUDevice, Map<string, GPUShaderModule>>();
const pipelineCache = new WeakMap<
  GPUDevice,
  Map<PipelineSpec, GPUComputePipeline | GPURenderPipeline>
>();

const cached = <K, V>(
  cache: WeakMap<GPUDevice, Map<K, V>>,
  device: GPUDevice,
  key: K,
  create: () => V
): V => {
  let byKey = cache.get(device);
  if (!byKey) {
    byKey = new Map();
    cache.set(device, byKey);
  }
  let value = byKey.get(key);
  if (value === undefined) {
    value = create();
    byKey.set(key, value);
  }
  return value;
};

const getBindGroupLayout = (device: GPUDevice, spec: BindGroupLayoutSpec) =>
  cached(layoutCache, device, spec, () =>
    device.createBindGroupLayout({
      label: spec.label,
      entries: spec.entries as GPUBindGroupLayoutEntry[],
    })
  );

const getShaderModule = (device: GPUDevice, code: string) =>
  cached(shaderCache, device, code, () => device.createShaderModule({ code }));

const layoutSpec = (program: CompiledProgram, name: string) => {
  const spec = program.layouts[name];
  if (!spec) throw new Error(`Unknown bind group layout: ${name}`);
  return spec;
};

const shaderCode = (program: CompiledProgram, index: number) => {
  const code = program.shaders[index];
  if (code === undefined) throw new Error(`Unknown shader: ${index}`);
  return code;
};

const pipelineSpec = (program: CompiledProgram, name: string) => {
  const spec = program.pipelines[name];
  if (!spec) throw new Error(`Unknown pipeline: ${name}`);
  return spec;
};

const createPipelineLayout = (
  device: GPUDevice,
  program: CompiledProgram,
  spec: PipelineSpec
) =>
  device.createPipelineLayout({
    label: `${spec.label} - Pipeline Layout`,
    bindGroupLayouts: spec.layouts.map((name) =>
      getBindGroupLayout(device, layoutSpec(program, name))
    ),
  });

export const getComputePipeline = (
  device: GPUDevice,
  program: CompiledProgram,
  name: string
): GPUComputePipeline => {
  const spec = pipelineSpec(program, name);
  if (spec.kind !== 'compute') throw new Error(`${name} is not compute`);
  return cached(pipelineCache, device, spec, () =>
    device.createComputePipeline({
      label: spec.label,
      layout: createPipelineLayout(device, program, spec),
      compute: {
        module: getShaderModule(device, shaderCode(program, spec.shader)),
      },
    })
  ) as GPUComputePipeline;
};

const renderPipelineCache = new WeakMap<
  GPUDevice,
  Map<PipelineSpec, Map<GPUTextureFormat, GPURenderPipeline>>
>();

export const getRenderPipeline = (
  device: GPUDevice,
  program: CompiledProgram,
  name: string,
  format: GPUTextureFormat
): GPURenderPipeline => {
  const spec = pipelineSpec(program, name);
  if (spec.kind !== 'render') throw new Error(`${name} is not render`);
  const byFormat = cached(
    renderPipelineCache,
    device,
    spec,
    () => new Map<GPUTextureFormat, GPURenderPipeline>()
  );
  let pipeline = byFormat.get(format);
  if (!pipeline) {
    pipeline = device.createRenderPipeline({
      label: spec.label,
      layout: createPipelineLayout(device, program, spec),
      vertex: {
        module: getShaderModule(device, shaderCode(program, spec.vertexShader)),
        buffers: [],
      },
      fragment: {
        module: getShaderModule(
          device,
          shaderCode(program, spec.fragmentShader)
        ),
        targets: spec.targets.map((target) => ({ ...target, format })),
      },
      primitive: spec.primitive,
    });
    byFormat.set(format, pipeline);
  }
  return pipeline;
};

export const createBindGroup = (
  device: GPUDevice,
  program: CompiledProgram,
  layoutName: string,
  resources: Readonly<Record<string, BindGroupResource>>
): GPUBindGroup => {
  const spec = layoutSpec(program, layoutName);
  return device.createBindGroup({
    label: spec.label,
    layout: getBindGroupLayout(device, spec),
    entries: spec.entries.map((entry, index) => {
      const key = spec.keys[index]!;
      const resource = resources[key];
      if (!resource) throw new Error(`Missing ${spec.label}.${key}`);
      return {
        binding: entry.binding,
        resource: entry.buffer
          ? { buffer: resource as GPUBuffer }
          : (resource as GPUSampler | GPUTextureView),
      };
    }),
  });
};
