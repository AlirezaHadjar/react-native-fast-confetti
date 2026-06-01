# TypeGPU Type System & Literal Handling

## Abstract types — plain JS literals are usually enough

Plain JS numbers become abstract types that auto-convert without any cast in the generated WGSL:

| JS value | Abstract type | Resolves to |
|---|---|---|
| `0.96`, `1.5` (non-integer) | `abstractFloat` | `f32`, `f16` |
| `0`, `1`, `42` (integer) | `abstractInt` | `i32`, `u32`, `f32`, `f16` |

So `d.f32(0.88)` as an arithmetic operand is always redundant — write `0.88`. Same inside vector constructors: `d.vec3f(0.52, 0.68, 0.12)`, no per-element `d.f32()`.

**When `d.f32()` IS needed:**
- `1.0` — bundler may strip `.0` → `abstractInt` → `i32`. Use `d.f32(1)` or keep a fractional part (`1.1` is fine).
- Uninitialised variable: `let x: number` errors — annotation is stripped. Use `let x = d.f32(0)`.

## Division always produces `f32`

`/` always yields `f32` regardless of operand types — `d.i32(10) / d.i32(3)` is `3.333...`. For integer division: `d.i32(10 / 3)` → `3`.

## TypeScript annotations don't affect WGSL

Type annotations are stripped before transpilation. WGSL type comes from the runtime value — the constructor called, the buffer schema, or the abstract literal type. `let x: d.v3f` still errors; the annotation does nothing.

---

## Samplers and textures — three contexts, different syntax

| Context | Sampler | Sampled texture | Storage texture |
|---|---|---|---|
| Plain callback annotation | `d.sampler` | `d.texture2d<d.F32>` | `d.textureStorage2d<'rgba16float', 'read-only'>` |
| `tgpu.fn` signature array | `d.sampler()` | `d.texture2d(d.f32)` | `d.textureStorage2d('rgba16float', 'read-only')` |
| `tgpu.bindGroupLayout` | `{ sampler: 'filtering' }` | `{ texture: d.texture2d(d.f32) }` | `{ storageTexture: d.textureStorage2d(...) }` |

Comparison sampler: `d.comparisonSampler` / `d.comparisonSampler()`. Bind group layout sampler strings: `'filtering'`, `'non-filtering'`, `'comparison'`.

```ts
// Plain callback — interface types as annotations:
const sampleColor = (samp: d.sampler, tex: d.texture2d<d.F32>, uv: d.v2f) => {
  'use gpu';
  return std.textureSample(tex, samp, uv);
};

// tgpu.fn — factory calls in the schema array:
const sampleColor = tgpu.fn([d.sampler(), d.texture2d(d.f32), d.vec2f], d.vec4f)(
  (samp, tex, uv) => { 'use gpu'; return std.textureSample(tex, samp, uv); }
);
```

---

## CPU-side buffer types

Never use `any`. There are two construction paths, each with its own type:

### `root.createBuffer` — full control

Returns `TgpuBuffer<TData>`. Call `.$usage()` to add flags; each flag extends the type as an intersection:

```ts
import { type TgpuBuffer, type UniformFlag, type StorageFlag, type VertexFlag } from 'typegpu';

const buf: TgpuBuffer<d.F32> & UniformFlag =
  root.createBuffer(d.f32).$usage('uniform');
```

Available flags (all imported from `'typegpu'`): `UniformFlag`, `StorageFlag`, `VertexFlag`, `IndexFlag`, `IndirectFlag`.

### `root.createUniform / createMutable / createReadonly` — shorthands

Return dedicated types. Use these as function parameter types:

```ts
import { type TgpuUniform, type TgpuMutable, type TgpuReadonly } from 'typegpu';

const config: TgpuUniform<typeof Config> = root.createUniform(Config, { time: 0 });
const particles: TgpuMutable<typeof ParticleArray> = root.createMutable(ParticleArray);
const lut: TgpuReadonly<typeof LutArray> = root.createReadonly(LutArray);
```

`typeof Schema` is the idiomatic generic argument — `Config`, `ParticleArray`, etc. are schema objects created with `d.struct(...)` or `d.arrayOf(...)`.

### Function parameters

Constrain only what you need:

```ts
// Accept any buffer holding a specific schema:
function upload(buf: TgpuBuffer<typeof Config>) { buf.write(...); }

// Require a specific usage:
function bindForRender(buf: TgpuBuffer<typeof Mesh> & VertexFlag) { ... }

// Accept either shorthand form:
function runSim(state: TgpuMutable<typeof SimState>) { ... }
```

---

## CPU-side texture types (`TgpuTexture<TProps>`)

Never use `any` for texture variables. `TgpuTexture` takes a `TextureProps` generic:

```ts
import { type TgpuTexture, type SampledFlag, type StorageFlag, type RenderFlag } from 'typegpu';

// Variable — let TypeScript infer when possible:
const tex = root.createTexture({ size: [512, 512], format: 'rgba16float' })
  .$usage('sampled', 'storage');
// inferred: TgpuTexture<{ size: [512, 512]; format: 'rgba16float' }> & SampledFlag & StorageFlag

// Named type alias (recommended for reuse):
type HdrTex = TgpuTexture<{ size: [number, number]; format: 'rgba16float' }> & SampledFlag;

// Function parameter — constrain only what you need:
function blur(src: TgpuTexture & SampledFlag, dst: TgpuTexture & StorageFlag) { ... }

// When format matters:
function loadIntoRgba8(tex: TgpuTexture<{ size: [number, number]; format: 'rgba8unorm' }>) { ... }
```

`$usage()` chains are intersection types — `& SampledFlag`, `& StorageFlag`, `& RenderFlag` — imported from `'typegpu'`. Use them in function signatures to express requirements without over-constraining the props generic.

**`TextureProps` fields** (all optional except `size` and `format`):

| Field | Type | Default |
|---|---|---|
| `size` | `[w]`, `[w, h]`, `[w, h, d]` | required |
| `format` | `GPUTextureFormat` | required |
| `dimension` | `'1d' \| '2d' \| '3d'` | `'2d'` |
| `mipLevelCount` | `number` | `1` |
| `sampleCount` | `number` | `1` (>1 = multisampled) |
| `viewFormats` | `GPUTextureFormat[]` | — |
