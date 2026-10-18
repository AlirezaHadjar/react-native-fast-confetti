/// <reference types="bun" />
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import typegpuPlugin from 'unplugin-typegpu/bun';

const root = resolve(import.meta.dir, '..');
const outputPath = join(root, 'src/webgpu/compiledShaders.ts');
const cacheDir = join(root, 'node_modules/.cache/compile-shaders');
const PRESENTATION_FORMAT = 'bgra8unorm';
const SCALAR_AND_VECTOR_TYPES = new Set([
  'f32',
  'u32',
  'i32',
  'vec2f',
  'vec3f',
  'vec4f',
  'vec2u',
  'vec3u',
  'vec4u',
  'vec2i',
  'vec3i',
  'vec4i',
]);

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
  GPUShaderStage: { VERTEX: 0x1, FRAGMENT: 0x2, COMPUTE: 0x4 },
  GPUTextureUsage: {
    COPY_SRC: 0x1,
    COPY_DST: 0x2,
    TEXTURE_BINDING: 0x4,
    STORAGE_BINDING: 0x8,
    RENDER_ATTACHMENT: 0x10,
  },
  GPUMapMode: { READ: 0x1, WRITE: 0x2 },
  GPUColorWrite: { RED: 0x1, GREEN: 0x2, BLUE: 0x4, ALPHA: 0x8, ALL: 0xf },
});

type Recorded = { kind: string; desc: Record<string, any> };

const recorded: Recorded[] = [];
// Throws on device APIs the runtime does not reproduce, so nothing is lost silently.
const strict = <T extends object>(name: string, target: T): T =>
  new Proxy(target, {
    get(object, key) {
      if (key in object || typeof key === 'symbol' || key === 'then') {
        return (object as Record<PropertyKey, unknown>)[key];
      }
      throw new Error(`TypeGPU used unsupported ${name}.${String(key)}`);
    },
  });
const record = (kind: string) => (desc: Record<string, any>) => {
  const handle = strict(kind, { kind, desc, toJSON: () => `<${kind}>` });
  recorded.push(handle);
  return handle;
};
const device = strict('GPUDevice', {
  label: 'compile-shaders',
  features: new Set<string>(),
  limits: {},
  queue: strict('GPUQueue', { writeBuffer() {}, submit() {} }),
  createShaderModule: record('shader'),
  createBindGroupLayout: record('bindGroupLayout'),
  createPipelineLayout: record('pipelineLayout'),
  createComputePipeline: record('computePipeline'),
  createRenderPipeline: record('renderPipeline'),
  createBuffer: record('buffer'),
});

const bundleArg = process.argv.find((arg) => arg.startsWith('--bundle='));
if (!bundleArg) {
  rmSync(cacheDir, { recursive: true, force: true });
  mkdirSync(cacheDir, { recursive: true });
  const entry = join(cacheDir, 'entry.ts');
  writeFileSync(
    entry,
    ['confetti', 'burstConfetti', 'physics/state']
      .map(
        (module, index) =>
          `import * as m${index} from ${JSON.stringify(join(root, 'shaders', module))};`
      )
      .concat(
        'export const modules = [m0, m1, m2];',
        "export { tgpu, d } from 'typegpu';"
      )
      .join('\n')
  );
  const build = await Bun.build({
    entrypoints: [entry],
    outdir: cacheDir,
    target: 'node',
    format: 'esm',
    external: ['typegpu'],
    plugins: [typegpuPlugin({})],
  });
  if (!build.success) {
    throw new AggregateError(build.logs, 'Bundling the shaders failed');
  }
  // A fresh process: loading the bundle where the plugin ran transforms it twice.
  const result = Bun.spawnSync(
    [
      process.execPath,
      import.meta.path,
      `--bundle=${build.outputs[0]!.path}`,
      ...process.argv.slice(2),
    ],
    { stdio: ['inherit', 'inherit', 'inherit'] }
  );
  process.exit(result.exitCode);
}
const bundle = await import(bundleArg.slice('--bundle='.length));
const [confetti, burst, state] = bundle.modules;
// The bundle's own instance: a second copy would reset TypeGPU's shader metadata.
const { tgpu, d } = bundle;
const tgpuRoot = tgpu.initFromDevice({
  device: device as unknown as GPUDevice,
  unstable_names: 'strict',
});

const describeType = (schema: any): unknown => {
  if (schema.type === 'struct') {
    return {
      size: d.sizeOf(schema),
      fields: Object.entries(schema.propTypes).map(([name, type]) => [
        name,
        d.memoryLayoutOf(schema, (value: any) => value[name]).offset,
        describeType(type),
      ]),
    };
  }
  if (!SCALAR_AND_VECTOR_TYPES.has(schema.type)) {
    throw new Error(`Unsupported data type: ${schema.type}`);
  }
  return schema.type;
};
const describeArray = (arraySchema: (count: number) => any) => {
  const element = arraySchema(1).elementType;
  return {
    stride: d.sizeOf(d.arrayOf(element, 1)),
    element: describeType(element),
  };
};

const compileProgram = (
  module: any,
  layoutNames: string[],
  createPipelines: () => Record<string, unknown>
) => {
  const layoutNameByHandle = new Map<unknown, string>();
  const layouts: Record<string, unknown> = {};
  for (const name of layoutNames) {
    const layout = module[name];
    const handle = tgpuRoot.unwrap(layout) as unknown as Recorded;
    const keys = Object.keys(layout.entries);
    const entries = handle.desc.entries;
    if (keys.length !== entries.length) {
      throw new Error(`${name} has optional entries, which are unsupported`);
    }
    layoutNameByHandle.set(handle, name);
    layouts[name] = { label: handle.desc.label, keys, entries };
  }

  const shaders: string[] = [];
  const shaderIndex = (handle: Recorded) => {
    const code = handle.desc.code as string;
    const index = shaders.indexOf(code);
    return index === -1 ? shaders.push(code) - 1 : index;
  };
  const layoutsOf = (pipeline: Recorded) =>
    (pipeline.desc.layout.desc.bindGroupLayouts as unknown[]).map((handle) => {
      const name = layoutNameByHandle.get(handle);
      if (!name) throw new Error('Pipeline uses an unlisted layout');
      return name;
    });

  const pipelines: Record<string, unknown> = {};
  for (const [name, pipeline] of Object.entries(createPipelines())) {
    const handle = tgpuRoot.unwrap(pipeline as never) as unknown as Recorded;
    const { desc } = handle;
    if (handle.kind === 'computePipeline') {
      const { module: shader, ...rest } = desc.compute;
      if (Object.keys(rest).length > 0) {
        throw new Error(`${name} uses unsupported compute options`);
      }
      pipelines[name] = {
        kind: 'compute',
        label: name,
        layouts: layoutsOf(handle),
        shader: shaderIndex(shader),
      };
      continue;
    }
    const { depthStencil, multisample, vertex, fragment, primitive } = desc;
    if (depthStencil || multisample || vertex.buffers.length > 0) {
      throw new Error(`${name} uses unsupported render state`);
    }
    pipelines[name] = {
      kind: 'render',
      label: name,
      layouts: layoutsOf(handle),
      vertexShader: shaderIndex(vertex.module),
      fragmentShader: shaderIndex(fragment.module),
      targets: fragment.targets.map(({ format, ...target }: any) => {
        if (format !== PRESENTATION_FORMAT) {
          throw new Error(`${name} has a fixed target format`);
        }
        return target;
      }),
      primitive,
    };
  }
  return { shaders, layouts, pipelines };
};

const confettiProgram = compileProgram(
  confetti,
  ['initLayout', 'computeLayout', 'renderLayout'],
  () => confetti.createConfettiPipelines(tgpuRoot, PRESENTATION_FORMAT, true)
);
const burstProgram = compileProgram(
  burst,
  ['burstInitLayout', 'burstTransformLayout', 'burstRenderLayout'],
  () => {
    const mixed = burst.createBurstConfettiPipelines(
      tgpuRoot,
      PRESENTATION_FORMAT,
      false
    );
    const textured = burst.createBurstConfettiPipelines(
      tgpuRoot,
      PRESENTATION_FORMAT,
      true
    );
    return { ...mixed, textureRenderPipeline: textured.renderPipeline };
  }
);

const bufferUsage = (create: () => { buffer: { buffer: unknown } }) =>
  (create().buffer.buffer as Recorded).desc.usage as number;
const uniformUsage = bufferUsage(() => tgpuRoot.createUniform(d.vec4f));
const storageUsage = bufferUsage(() => tgpuRoot.createMutable(d.vec4f));
if (bufferUsage(() => tgpuRoot.createReadonly(d.vec4f)) !== storageUsage) {
  throw new Error('Readonly and mutable storage buffers differ in usage');
}

const confettiLayouts = {
  uniforms: describeType(confetti.UniformsSchema),
  initUniforms: describeType(confetti.InitUniformsSchema),
  sizes: describeArray(confetti.SizeArraySchema),
  initSizes: describeArray(confetti.InitSizeArraySchema),
  palette: describeArray(confetti.PaletteArraySchema),
  spawns: describeArray(state.ParticleSpawnArraySchema),
  runtime: describeArray(state.ParticleRuntimeArraySchema),
};
const burstLayouts = {
  uniforms: describeType(burst.BurstUniformsSchema),
  initUniforms: describeType(burst.BurstInitUniformsSchema),
  particles: describeArray(burst.BurstParticleArraySchema),
  runtime: describeArray(burst.BurstRuntimeArraySchema),
  transforms: describeArray(burst.BurstTransformArraySchema),
  origins: describeArray(burst.BurstOriginArraySchema),
  initSizes: describeArray(burst.BurstInitSizeArraySchema),
  sizes: describeArray(burst.BurstSizeArraySchema),
  palette: describeArray(burst.BurstPaletteArraySchema),
  opacityKeyframes: describeArray(burst.BurstOpacityKeyframeArraySchema),
};

const json = (value: unknown) => JSON.stringify(value, null, 2);
const layoutEntries = (layouts: Record<string, any>) =>
  Object.entries(layouts)
    .map(
      ([name, layout]) =>
        `  ${name}: ${json(layout)} satisfies ${'stride' in layout ? 'ArrayLayout' : 'StructType'},`
    )
    .join('\n');
const constant = (module: any, name: string) =>
  `export const ${name} = ${json(module[name])} as const;`;

const source = `// Generated by scripts/compile-shaders.ts from shaders/. Do not edit.
import type { ArrayLayout, CompiledProgram, StructType } from './gpuProgram';

export const BUFFER_USAGE = ${json({ uniform: uniformUsage, storage: storageUsage })} as const;

${constant(confetti, 'VERTS_PER_FLAKE')}
${constant(confetti, 'UNIFORMS_BYTES')}
${constant(confetti, 'UNIFORM_FLOAT_OFFSETS')}

export const confettiLayouts = {
${layoutEntries(confettiLayouts)}
};

export const confettiProgram: CompiledProgram = ${json(confettiProgram)};

${constant(burst, 'BURST_VERTS_PER_FLAKE')}
${constant(burst, 'BURST_UNIFORMS_BYTES')}
${constant(burst, 'BURST_UNIFORM_FLOAT_OFFSETS')}
${constant(burst, 'BURST_INIT_GENERATION_BYTE_OFFSET')}

export const burstLayouts = {
${layoutEntries(burstLayouts)}
};

export const burstProgram: CompiledProgram = ${json(burstProgram)};
`;

const formatted = execFileSync(
  join(root, 'node_modules/.bin/oxfmt'),
  [`--stdin-filepath=${outputPath}`],
  { cwd: root, input: source, encoding: 'utf8' }
);

if (process.argv.includes('--check')) {
  const current = readFileSync(outputPath, 'utf8');
  if (current !== formatted) {
    console.error(
      'src/webgpu/compiledShaders.ts is out of date. Run `bun run compile:shaders` and commit the result.'
    );
    process.exit(1);
  }
  console.log('src/webgpu/compiledShaders.ts matches shaders/.');
} else {
  writeFileSync(outputPath, formatted);
  console.log(
    `Wrote src/webgpu/compiledShaders.ts: ${confettiProgram.shaders.length + burstProgram.shaders.length} shader modules, ${Object.keys(confettiProgram.pipelines).length + Object.keys(burstProgram.pipelines).length} pipelines.`
  );
}
