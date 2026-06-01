---
name: typegpu
description: >-
  TypeGPU is type-safe WebGPU in TypeScript. Use whenever the user writes, debugs, or designs TypeGPU code: 'use gpu' shader functions, tgpu.fn, buffers, textures, bind groups, compute and render pipelines, vertex layouts, slots, accessors, and any TypeGPU API. Shader logic and CPU-side resources are tightly coupled - handle both sides here even if the user only mentions one (e.g. "how do I write a shader", "how do I create a buffer"). Trigger on any mention of typegpu, tgpu, "use gpu", TypedGPU, or WebGPU code written using TypeGPU's schema API (d.*, tgpu.*, std.*). Do NOT trigger for raw WebGPU (using GPUDevice/GPURenderPipeline directly without tgpu), WGSL-only questions, Three.js, Babylon.js, or WebGL.
---

# TypeGPU

A single schema (`d.*`) defines a GPU type, CPU buffer layout, and TypeScript type at once - no manual alignment, type mapping, or casting. The build plugin `unplugin-typegpu` transforms `'use gpu'`-marked TypeScript for runtime WGSL transpilation, enabling type inference and polymorphism across the CPU/GPU boundary.

This skill targets TypeGPU `0.11.2`. If the user's project is on an older release, verify API availability before relying on examples or recommended patterns here.

---

## When to read reference files

**Read before writing virtually any shader or GPU function** — these two cover the rules that trip people up most:
- `references/types.md` — abstract type resolution, exactly when `d.f32()` is required vs redundant, sampler/texture schemas for `tgpu.fn` signatures, CPU-side `TgpuBuffer`/`TgpuTexture` TypeScript types. **If you skip this, you'll hit type errors.**
- `references/shaders.md` — full `std` library listing, loops (`std.range`, `tgpu.unroll`), `tgpu.comptime`, outer-scope capture rules, complete builtin reference for all three shader stages, `console.log`. **Read this for any non-trivial shader logic.**

**Read when the task specifically involves:**
- `references/pipelines.md` — vertex buffers/layouts, `attribs` wiring, MRT, fullscreen triangle, depth/stencil, blend modes, `fragDepth` output, loading 3D models (`@loaders.gl`), resolve API
- `references/matrices.md` — `wgpu-matrix` integration, column-major layout, camera uniforms, `common.writeSoA`, fast-path CPU writes. **Read for any 3D work** (view/projection matrices, animated transforms, model loading)
- `references/textures.md` — texture creation, views, samplers, storage textures, mipmaps, multisampling
- `references/noise.md` — `@typegpu/noise` (random, distributions, Perlin 2D/3D)
- `references/sdf.md` — `@typegpu/sdf` (2D/3D primitives, operators, ray marching, AA masking)
- `references/setup.md` — install, `unplugin-typegpu` build plugin, `tsover` operator overloading
- `references/advanced.md` — buffer reinterpretation, indirect drawing/dispatch, custom encoders

---

## Setup

```ts
import tgpu, { d, std, common } from 'typegpu';

const root = await tgpu.init();             // request a GPU device
const root = tgpu.initFromDevice(device);   // or wrap an existing GPUDevice

const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });
```

Create one root at app startup. Resources from different roots cannot interact. 

---

## Data schemas (`d.*`)

A schema defines memory layout and infers TypeScript types; the same schema is used for buffers, shader signatures, and bind group entries.

### Scalars
```ts
d.f32    d.i32    d.u32    d.f16
// d.bool is NOT host-shareable - use d.u32 in buffers
```

### Vectors and matrices
```ts
d.vec2f  d.vec3f  d.vec4f     // f32
d.vec2i  d.vec3i  d.vec4i     // i32
d.vec2u  d.vec3u  d.vec4u     // u32
d.vec2h  d.vec3h  d.vec4h     // f16

d.mat2x2f   d.mat3x3f   d.mat4x4f
```

Instance types: `d.vec3f()` -> `d.v3f`, `d.mat4x4f()` -> `d.m4x4f`.

**Vector constructors are richly overloaded - use them.** They compose from any mix of scalars and smaller vectors that adds up to the right component count:

```ts
d.vec3f()              // zero-init: (0, 0, 0)
d.vec3f(1)             // broadcast:  (1, 1, 1)
d.vec3f(1, 2, 3)       // individual components
d.vec3f(someVec2, 1)   // vec2 + scalar
d.vec3f(1, someVec2)   // scalar + vec2

d.vec4f()              // zero-init: (0, 0, 0, 0)
d.vec4f(0.5)           // broadcast:  (0.5, 0.5, 0.5, 0.5)
d.vec4f(rgb, 1)        // vec3 + scalar (common: color + alpha)
d.vec4f(v2a, v2b)      // two vec2s
d.vec4f(1, uv, 0)      // scalar + vec2 + scalar
```

Swizzles (`.xy`, `.zw`, `.rgb`, `.ba`, etc.) return vector instances that work as constructor arguments: `d.vec4f(pos.xy, vel.zw)`.

**Prefer these overloads over manual component decomposition.** Instead of `d.vec3f(v.x, v.y, newZ)`, write `d.vec3f(v.xy, newZ)`.

### Compound types
```ts
const Particle = d.struct({
  position: d.vec2f,
  velocity: d.vec2f,
  color:    d.vec4f,
});

const ParticleArray = d.arrayOf(Particle, 1000); // fixed-size
```

**Runtime-sized schemas.** `d.arrayOf(Element)` without a count returns a *function* `(n: number) => WgslArray<Element>`. This dual nature is the key: pass the function itself (unsized) to bind group layouts, call it with a count (sized) for buffer creation.

```ts
// Plain array - arrayOf without count is already a factory:
const layout = tgpu.bindGroupLayout({
  data: { storage: d.arrayOf(d.f32), access: 'mutable' },  // unsized for layout
});
const buf = root.createBuffer(d.arrayOf(d.f32, 1024)).$usage('storage'); // sized for buffer

// Struct with a runtime-sized last field - wrap in a factory function:
const RuntimeStruct = (n: number) =>
  d.struct({
    counter: d.atomic(d.u32),
    items:   d.arrayOf(d.f32, n),  // last field gets the runtime size
  });

const layout2 = tgpu.bindGroupLayout({
  runtimeData: { storage: RuntimeStruct, access: 'mutable' }, // unsized (the function)
});
const buf2 = root.createBuffer(RuntimeStruct(1024)).$usage('storage'); // sized (called)
```

You cannot pass an unsized schema directly to `createBuffer` - size must be known on the CPU.

---

## GPU functions

TypeGPU compiles TypeScript marked with `'use gpu'` into WGSL.

### Plain callback (polymorphic)

No explicit signature; best for helper math and flexible utilities.

```ts
const rotate = (v: d.v2f, angle: number) => {
  'use gpu';
  const c = std.cos(angle);
  const s = std.sin(angle);
  return d.vec2f(c * v.x - s * v.y, s * v.x + c * v.y);
};
```

`number` parameters and unions like `d.v2f | d.v3f` are polymorphic - TypeGPU generates one WGSL overload per unique call-site type combination. Values captured from outer scope are **inlined as WGSL literals**; use buffers/uniforms for anything that changes at runtime.

### `tgpu.fn` (explicit types)

Pinned WGSL signature. Use for library code or when you need a fixed WGSL interface.

```ts
const rotate = tgpu.fn([d.vec2f, d.f32], d.vec2f)((v, angle) => {
  'use gpu';
  // ...
});
```

### Shader entrypoints

```ts
// Compute
const myCompute = tgpu.computeFn({
  workgroupSize: [64],
  in: { gid: d.builtin.globalInvocationId },
})((input) => { 'use gpu'; /* input.gid: d.v3u */ });

// Vertex
const myVertex = tgpu.vertexFn({
  in:  { position: d.vec3f, uv: d.vec2f },
  out: { position: d.builtin.position, fragUv: d.vec2f },
})((input) => {
  'use gpu';
  return { position: d.vec4f(input.position, 1), fragUv: input.uv };
});

// Fragment
const myFragment = tgpu.fragmentFn({
  in: { fragUv: d.vec2f },
  out: d.vec4f,
})((input) => { 'use gpu'; return d.vec4f(input.fragUv, 0, 1); });
```

Vertex `in` may include builtins: `d.builtin.vertexIndex`, `d.builtin.instanceIndex`.

Full shader syntax, branch pruning, the `std` library, and type inference: see `references/shaders.md`.

---

**Values vs references** — the most common source of `ResolutionError`. See `references/shaders.md`.

**Idiomatic patterns** (vector ops, struct constructors, register pressure): see `references/shaders.md`.

---

## Buffers

### Creating

```ts
// Schema only:
const buf = root.createBuffer(d.arrayOf(Particle, 1000)).$usage('storage');

// With typed initial value (only when non-zero — all buffers are zero-initialized by default):
const uBuf = root.createBuffer(Config, { time: 1, scale: 2.0 }).$usage('uniform');

// With an initializer callback - buffer is still mapped (cheapest CPU path):
const buf = root.createBuffer(Schema, (mappedBuffer) => {
  mappedBuffer.write([10, 20], { startOffset: firstChunk.offset });
  mappedBuffer.write([30, 40], { startOffset: secondChunk.offset });
});

// Wrap an existing GPUBuffer (you own its lifecycle and flags):
const buf = root.createBuffer(d.u32, existingGPUBuffer);
buf.write(12);
```

### Usage flags

| Literal | Shader access |
|---|---|
| `'uniform'` | `var<uniform>` |
| `'storage'` | `var<storage, read>` (or `read_write` with `access: 'mutable'`) |
| `'vertex'` | vertex input, paired with `tgpu.vertexLayout` |
| `'index'` | index buffer (`d.u16` or `d.u32` schema only) |
| `'indirect'` | indirect dispatch/draw |

All buffers get `COPY_SRC | COPY_DST` automatically. `$addFlags(GPUBufferUsage.X)` adds any flag not covered by `$usage`.

### Writing

`.write(value)` handles alignment. Four input forms (slowest → fastest):

| Form | Example (`vec3f`) | Notes |
|---|---|---|
| Typed instance | `d.vec3f(1, 2, 3)` | Allocates a wrapper — fine for setup/prototypes |
| Plain JS array / tuple | `[1, 2, 3]` | No allocation, padding added automatically |
| TypedArray | `new Float32Array([1, 2, 3])` | Bytes copied verbatim — **must include WGSL padding** |
| ArrayBuffer | `rawBytes` | Maximum throughput, bytes copied verbatim |

Cache plain arrays or `Float32Array` at setup and reuse. For the padding rules (`vec3f` = 16 bytes, `mat3x3f` per-column padding) and full fast-path guidance, see `references/matrices.md`.

**Slice write** - update a sub-region using `d.memoryLayoutOf` to get byte offsets:

```ts
const layout = d.memoryLayoutOf(schema, (a) => a[3]);
buffer.write([4, 5, 6], { startOffset: layout.offset });
```

**`.patch(data)`** - update specific struct fields or array indices without touching the rest:

```ts
planetBuffer.patch({
  mass: 123.1,
  colors: { 2: [1, 0, 0], 4: d.vec3f(0, 0, 1) },
});
```

**`common.writeSoA(buffer, { field: Float32Array, ... })`** - scatter separate packed per-field arrays into the GPU's AoS layout with correct padding. The idiomatic path for particle systems, simulations, and model loading where CPU data is already field-separated. See `references/matrices.md` for examples and `references/pipelines.md` for the model-loading pattern.

**GPU-side copy:** `destBuffer.copyFrom(srcBuffer)` (schemas must match).

### Reading

```ts
const data = await buffer.read(); // returns a typed JS value matching the schema
```

### Shorthand "fixed" resources

Skip manual bind groups - the buffer is always bound when referenced in any shader:

```ts
const particlesMutable = root.createMutable(d.arrayOf(Particle, 1000));  // var<storage, read_write>
const configUniform    = root.createUniform(Config);                     // var<uniform>
const bufReadonly      = root.createReadonly(d.arrayOf(d.f32, N));       // var<storage, read>
```

Access inside shaders via `particles.$`, `config.$`. Prefer fixed resources by default; switch to manual bind groups when you need to swap resources per frame, manage `@group` indices, or share layouts across pipelines.

---

## Bind group layouts (manual binding)

```ts
const layout = tgpu.bindGroupLayout({
  config:    { uniform: ConfigSchema },
  particles: { storage: d.arrayOf(Particle), access: 'mutable' },
  mySampler: { sampler: 'filtering' },   // 'filtering' | 'non-filtering' | 'comparison'
  myTexture: { texture: d.texture2d(d.f32) },
});

// Inside shaders: layout.$.config, layout.$.particles, ...

const bindGroup = root.createBindGroup(layout, {
  config:    configBuffer,
  particles: particleBuffer,
  mySampler: tgpuSampler,
  myTexture: textureOrView,
});

pipeline.with(bindGroup).dispatchWorkgroups(N);
```

Explicit `@group` index (only needed when integrating with raw WGSL that hardcodes group indices): `layout.$idx(0)`.

---

## Compute pipelines

```ts
// Standard - you control workgroup sizing
const pipeline = root.createComputePipeline({ compute: myComputeFn });
pipeline.with(bindGroup).dispatchWorkgroups(Math.ceil(N / 64));

// Guarded - TypeGPU handles workgroup sizing and bounds checking automatically.
// The callback's parameter count sets the dimensionality (0D to 3D):
const p0 = root.createGuardedComputePipeline(() => { 'use gpu'; /* runs once */ });
const p1 = root.createGuardedComputePipeline((x: number) => { 'use gpu'; });
const p2 = root.createGuardedComputePipeline((x: number, y: number) => { 'use gpu'; });
const p3 = root.createGuardedComputePipeline((x: number, y: number, z: number) => { 'use gpu'; });

// dispatchThreads matches the callback's arity - pass thread counts, not workgroup counts.
// TypeGPU picks workgroup sizes internally and injects a bounds guard so threads
// outside the requested range are no-ops.
p2.with(bindGroup).dispatchThreads(width, height);

// WGSL builtins like globalInvocationId are NOT available - use the callback parameters instead.
```

---

## WebGPU coordinate conventions

WebGPU matches DirectX/Metal, **not** OpenGL/WebGL — porting tutorials verbatim causes subtle bugs:

- **NDC z: `[0, 1]`**, not `[-1, 1]`. A copy-pasted `gluPerspective` clips the near plane. Use `wgpu-matrix`'s `mat4.perspective` (already targets `[0, 1]`), or `mat4.perspectiveReverseZ` for better depth precision.
- **Framebuffer `(0, 0)` is top-left**, `+y` down — opposite of OpenGL. `d.builtin.position.xy` in a fragment shader is pixel-space with this origin.
- **Texture UV `(0, 0)` is top-left**. Do _not_ pre-flip `v` — `createImageBitmap` already matches this.
- **Matrices are column-major**: `d.mat4x4f(c0, c1, c2, c3)` takes columns. Inside shaders use `mat.columns[c][r]`; plain `mat[i]` is rejected. Composition: `projection * view * model * position`. See `references/matrices.md`.

---

## Render pipelines

```ts
const pipeline = root.createRenderPipeline({
  vertex:   myVertex,
  fragment: myFragment,
  targets:  { format: presentationFormat }, // single target - shorthand
  primitive?:    GPUPrimitiveState,
  depthStencil?: GPUDepthStencilState,
  multisample?:  GPUMultisampleState,
});

pipeline
  .with(bindGroup)
  .withColorAttachment({
    view: context,
    // loadOp/storeOp/clearValue have defaults
  })
  .withDepthStencilAttachment({ /* ... */ })
  .withIndexBuffer(indexBuffer)  // enables .drawIndexed()
  .draw(vertexCount, instanceCount /* optional */);
```

Shell-less inline vertex/fragment lambdas are also valid for simple cases.

### Multiple render targets (MRT)

Use a **named record** for fragment `out`, pipeline `targets`, and `withColorAttachment` — TypeScript enforces matching keys. Keys become WGSL struct field names verbatim; no `$`-prefixes. Builtins (`fragDepth`) go in `out` but do **not** appear in `targets` or `withColorAttachment`.

Full MRT example, per-target blend/writeMask config, and the `fragDepth` footgun: see `references/pipelines.md`.

### Cache bind groups and views

`root.createBindGroup(...)` and `texture.createView(...)` allocate fresh GPU objects each call. Fine for prototypes; for anything you care about, create them once at setup (near the resource they wrap), store handles in `const`s, and reuse. Per-frame allocation isn't slow per se, but it raises GC pressure and introduces stutters. When a view or bind group legitimately varies each frame, cache the small set you cycle through.

For vertex buffer layouts, the attribs spread trick, and the `common.fullScreenTriangle` helper: `references/pipelines.md`.

---

## GPU-scoped variables

`tgpu.workgroupVar(schema)` — shared across all threads in a workgroup (compute only). `tgpu.privateVar(schema)` — thread-private. `tgpu.const(schema, value)` — compile-time constant embedded as a WGSL literal. Access all via `.$`. Full examples in `references/shaders.md`.

---

## Slots

`tgpu.slot<T>()` is a typed placeholder; fill with `.with(slot, value)` at pipeline, root, or function scope. Any type fits: GPU values, functions, callbacks. Slots are the idiomatic way to build configurable/reusable shaders.

```ts
const distFnSlot = tgpu.slot<(pos: d.v3f) => number>();

const rayMarcher = tgpu.computeFn({
  workgroupSize: [64],
  in: { gid: d.builtin.globalInvocationId },
})(({ gid }) => {
  'use gpu';
  const dist = distFnSlot.$(d.vec3f(gid)); // call the injected function
});

root
  .with(distFnSlot, (pos) => {
    'use gpu';
    return std.length(pos - d.vec3f(0, 0, -5)) - 1.0; // sphere SDF
  })
  .createComputePipeline({ compute: rayMarcher });
```

Scalar/vector slot with a default:

```ts
const colorSlot = tgpu.slot(d.vec4f(1, 0, 0, 1));
pipeline.with(colorSlot, d.vec4f(0, 1, 0, 1)).draw(3);
```

---

## Accessors

`tgpu.accessor(schema, initial?)` is schema-aware - the value can be a buffer binding, a constant, a literal, or a `'use gpu'` function returning one. The shader is agnostic about how the value is sourced. If they can be cleanly used, they should be preferred over slots.

```ts
const colorAccess = tgpu.accessor(d.vec3f);

// Fill with a uniform buffer:
root.with(colorAccess, colorUniform).createComputePipeline(...)

// Fill with a literal (inlined):
root.with(colorAccess, d.vec3f(1, 0, 0)).createComputePipeline(...)

// Fill with a GPU function:
root.with(colorAccess, () => { 'use gpu'; return computeColor(); }).createComputePipeline(...)
```

Write access: `tgpu.mutableAccessor(schema, initial?)`.

---

## Type utilities

`d.InferInput<typeof Schema>` — CPU-side type accepted by `.write()`. `d.InferGPU<typeof Schema>` — type inside `'use gpu'` functions. `AnyData` (from `'typegpu'`) — broadest schema constraint for generics. Full buffer/texture TypeScript types (`TgpuBuffer`, `TgpuUniform`, `TgpuTexture`, usage flags): `references/types.md`.

---

## Common pitfalls

1. **Numeric literals**: `1.0` may strip -> `abstractInt`. Use `d.f32(1)`. See types.md.
2. **Outer-scope captures are constants**: not runtime-mutable. Use `createUniform`/`createMutable`. See shaders.md.
3. **TypedArray/ArrayBuffer alignment**: bytes copied verbatim. `vec3f` elements are 16 bytes (12 + 4 padding). Plain arrays handle padding; typed arrays must include it.
4. **Integer division**: `a / b` on primitives is `f32`. Use `d.i32()`/`d.u32()` for integer semantics. See types.md.
5. **Uninitialised variables**: `let x;` is invalid - always initialise so the type can be inferred: `let x = d.f32(0)`.
6. **Ternary operators**: runtime ternaries aren't supported. Use `std.select(falseVal, trueVal, condition)`.
7. **Fragment output is always `d.vec4f`**, even for fewer-channel formats. A pipeline with `targets: { format: 'r8unorm' }` or `'rg16float'` still requires `out: d.vec4f` and `return d.vec4f(...)`. WebGPU drops the unused channels.

---

## Companion packages

- **`@typegpu/noise`** - real PRNG (`randf`), distributions (uniform, normal, hemisphere, ...), and Perlin noise (`perlin2d`/`perlin3d`) with optional precomputed gradient caches (~10x speedups). Prefer over hand-rolled hashes. See `references/noise.md`.

- **`@typegpu/sdf`** - 2D/3D signed distance primitives (`sdDisk`, `sdBox2d`, `sdRoundedBox2d`, `sdBezier`, `sdSphere`, `sdBox3d`, `sdCapsule`, `sdPlane`, ...) and operators (`opUnion`, `opSmoothUnion`, `opSmoothDifference`, `opExtrudeX/Y/Z`). All `tgpu.fn` with pinned types, callable directly from `'use gpu'`. For ray marching, UI masking, AA vector drawing. See `references/sdf.md`.

- **[`wgpu-matrix`](https://github.com/greggman/wgpu-matrix)** - canonical math library for TypeGPU. TypeGPU vectors/matrices can be passed as `dst` to `wgpu-matrix` calls to avoid allocations. See `references/matrices.md` for full integration patterns.
