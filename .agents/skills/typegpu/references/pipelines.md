# TypeGPU Pipelines and Vertex Buffers

## Vertex layouts

`tgpu.vertexLayout(schemaFn, stepMode?)` describes how a vertex buffer maps to shader `in` parameters.

```ts
// Per-vertex (default):
const vertexLayout = tgpu.vertexLayout(d.arrayOf(d.vec2f));

// Per-instance:
const instanceLayout = tgpu.vertexLayout(d.arrayOf(InstanceData), 'instance');

// Loose layout - compact GPU vertex formats, no WGSL alignment rules:
const looseLayout = tgpu.vertexLayout(d.disarrayOf(d.unstruct({
  tilt:  d.f32,
  color: d.unorm8x4,
})), 'instance');
```

### Compact vertex formats (for `unstruct` / `disarrayOf`)

Reduce vertex bandwidth. Use inside `d.unstruct({...})`:

```ts
// Float
d.float32   d.float32x2   d.float32x3   d.float32x4
d.float16   d.float16x2   d.float16x4

// Unsigned integer
d.uint8     d.uint8x2     d.uint8x4
d.uint16    d.uint16x2    d.uint16x4
d.uint32    d.uint32x2    d.uint32x3    d.uint32x4

// Signed integer
d.sint8     d.sint8x2     d.sint8x4
d.sint16    d.sint16x2    d.sint16x4
d.sint32    d.sint32x2    d.sint32x3    d.sint32x4

// Normalised (integer packed float in [0,1] or [-1,1])
d.unorm8    d.unorm8x2    d.unorm8x4
d.unorm16   d.unorm16x2   d.unorm16x4
d.snorm8    d.snorm8x2    d.snorm8x4
d.snorm16   d.snorm16x2   d.snorm16x4
```

Compact-format buffers are restricted to `'vertex'` usage. To share memory with storage, use buffer reinterpretation (`references/advanced.md`).

---

## Wiring layouts into a render pipeline

The `attribs` field maps vertex layout attributes to shader `in` parameter names. For struct layouts, use the **spread trick**:

```ts
const VertexData   = d.struct({ position: d.vec3f, normal: d.vec3f, uv: d.vec2f });
const InstanceData = d.struct({ transform: d.vec4f, color: d.vec4f });

const vertexLayout   = tgpu.vertexLayout(d.arrayOf(VertexData));
const instanceLayout = tgpu.vertexLayout(d.arrayOf(InstanceData), 'instance');

const pipeline = root.createRenderPipeline({
  attribs: { ...vertexLayout.attrib, ...instanceLayout.attrib }, // spread both
  vertex:  mainVert,
  fragment: mainFrag,
  targets: { format: 'rgba8unorm' },
});
```

For a non-struct layout, `layout.attrib` is a single `TgpuVertexAttrib`:

```ts
attribs: vertexLayout.attrib              // name inferred from shader param
attribs: { pos: vertexLayout.attrib }     // explicit name mapping
```

Pick fields selectively:

```ts
attribs: {
  ...geometryLayout.attrib,
  center: dataLayout.attrib.position,   // rename/remap a field from another layout
}
```

Builtins (`d.builtin.vertexIndex`, etc.) are accessed directly via shader `in` - they do not go through `attribs`.

---

## Binding vertex buffers

Use `.with(layout, buffer)`. Can be pre-bound at creation or swapped per frame:

```ts
const prebound = pipeline.with(vertexLayout, vertexBuffer);

prebound
  .with(instanceLayout, instanceBuffers[frameIndex])
  .withColorAttachment({ view: renderView })
  .draw(3, instanceCount);
```

---

## Loading 3D models

Use `@loaders.gl/obj` or `@loaders.gl/gltf` to load meshes. loaders.gl returns separate flat typed arrays per attribute (positions, normals, UVs) — already SoA format. Combine with `common.writeSoA` for zero-copy buffer writes:

```ts
import { load } from '@loaders.gl/core';
import { OBJLoader } from '@loaders.gl/obj';
import { common } from 'typegpu';

const mesh = await load('/model.obj', OBJLoader);
const vertexCount = mesh.attributes.POSITION.value.length / 3;

const vertexBuffer = root
  .createBuffer(vertexLayout.schemaForCount(vertexCount))
  .$usage('vertex');

common.writeSoA(vertexBuffer, {
  position: mesh.attributes.POSITION.value,   // Float32Array, packed xyz
  normal:   mesh.attributes.NORMAL.value,      // Float32Array, packed xyz
  uv:       mesh.attributes.TEXCOORD_0.value,  // Float32Array, packed uv
});
```

`writeSoA` scatters packed per-field arrays into the AoS GPU layout with correct padding — performant and convenient, no manual loops or per-vertex `d.vec3f()` allocations.

---

## Index buffers

```ts
const indexBuffer = root
  .createBuffer(d.arrayOf(d.u16, 6), [0, 2, 1, 0, 3, 2])
  .$usage('index');

pipeline
  .withIndexBuffer(indexBuffer)
  .drawIndexed(6);
```

Only `d.u16` and `d.u32` schemas are valid.

---

## Depth / stencil

```ts
const depthTex = root.createTexture({
  size: [width, height],
  format: 'depth24plus',
}).$usage('render');
const depthView = depthTex.createView('render'); // cache at setup

pipeline
  .withDepthStencilAttachment({
    view:            depthView,
    depthLoadOp:     'clear',
    depthStoreOp:    'store',
    depthClearValue: 1.0,
  })
  .draw(vertexCount);
```

Enable depth testing via `depthStencil` in `createRenderPipeline`:

```ts
root.createRenderPipeline({
  vertex: ..., fragment: ..., targets: ...,
  depthStencil: {
    format:            'depth24plus',
    depthWriteEnabled: true,
    depthCompare:      'less',
  },
});
```

> WebGPU clip space uses `z in [0, 1]`, not OpenGL's `[-1, 1]`. A copy-pasted GL perspective matrix will clip the near plane. With `depthClearValue: 1.0` + `depthCompare: 'less'`, near is `z = 0`. Reversed-Z: `depthClearValue: 0.0` + `depthCompare: 'greater'`, near at `z = 1`. See "WebGPU Coordinate Conventions" in SKILL.md.

---

## Multiple render targets (MRT)

Render pipelines accept a single target shorthand or a **named record**. With more than one colour output, all three sites (fragment `out`, pipeline `targets`, `withColorAttachment`) must use the same keys; TypeScript catches typos and missing entries.

```ts
const gBufferFrag = tgpu.fragmentFn({
  in:  { worldPos: d.vec3f, normal: d.vec3f },
  out: { albedo: d.vec4f, normal: d.vec4f, position: d.vec4f },
})((input) => ({
  albedo:   d.vec4f(0.8, 0.2, 0.2, 1),
  normal:   d.vec4f(input.normal, 0),
  position: d.vec4f(input.worldPos, 1),
}));

const pipeline = root.createRenderPipeline({
  vertex: myVertex,
  fragment: gBufferFrag,
  targets: {
    albedo:   { format: 'rgba8unorm' },
    normal:   { format: 'rgba16float' },
    position: { format: 'rgba16float' },
  },
});

pipeline
  .with(bindGroup)
  .withColorAttachment({
    albedo:   { view: albedoView },
    normal:   { view: normalView },
    position: { view: positionView },
  })
  .draw(vertexCount);
```

> `albedoView`/`normalView`/`positionView` are cached at setup - see "Cache bind groups and views" in SKILL.md.

### Single-target shorthand

```ts
fragment: tgpu.fragmentFn({ out: d.vec4f })(() => d.vec4f(1, 0, 0, 1)),
targets:  { format: 'bgra8unorm' },
// pipeline.withColorAttachment({ view: context })
```

Equivalent to a single named target. Switch to the keyed form once you need >=2 outputs or per-target config.

### Per-target blend, writeMask, etc.

Each entry in `targets` accepts the full `GPUColorTargetState`:

```ts
targets: {
  hdrColor: {
    format: 'rgba16float',
    blend: {
      color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
      alpha: { srcFactor: 'one',       dstFactor: 'one',                 operation: 'add' },
    },
  },
  bloomMask: {
    format: 'r8unorm',
    writeMask: GPUColorWrite.RED,
  },
}
```

Per-target config is one of the main reasons to use the keyed form even with a single output.

### Custom depth output (`d.builtin.fragDepth`)

A fragment shader can write its own depth via the `fragDepth` builtin - useful for ray marching, impostors, anything not drawn at the rasterized depth. The builtin lives in the fragment `out` record, **but it is not a colour target** - it does not appear in `targets` or `withColorAttachment`. Depth still goes through `depthStencil` + `withDepthStencilAttachment`.

```ts
const fragMain = tgpu.fragmentFn({
  in:  { worldPos: d.vec3f },
  out: { color: d.vec4f, depth: d.builtin.fragDepth },
})((input) => ({
  color: d.vec4f(shade(input.worldPos), 1),
  depth: customDepth(input.worldPos), // a number in [0, 1]
}));

const pipeline = root.createRenderPipeline({
  vertex: myVertex,
  fragment: fragMain,
  targets: {
    color: { format: presentationFormat }, // only `color` - `depth` NOT here
  },
  depthStencil: {
    format: 'depth24plus',
    depthWriteEnabled: true,
    depthCompare: 'less',
  },
});

pipeline
  .with(bindGroup)
  .withColorAttachment({
    color: { view: context },           // only `color`
  })
  .withDepthStencilAttachment({
    view: depthView,
    depthClearValue: 1,
    depthLoadOp: 'clear',
    depthStoreOp: 'store',
  })
  .draw(vertexCount);
```

> **Common footgun:** writing `targets: { color: ..., depth: ... }` because the fragment has a `depth` output. Builtins (`fragDepth`, `sampleMask`) are control signals, not colour attachments. Only `d.vec4f` outputs become entries in `targets`.

### Name-matching rules

- Keys in `out` (excluding builtins) must match keys in `targets` exactly. TypeGPU assigns sequential `@location(N)` automatically; no `d.location(...)` needed.
- Keys in `withColorAttachment` must match `targets`. TypeScript rejects missing/extra entries.
- Shaders authored with explicit `d.location(0, ...)` respect your manual indices (as long as they don't conflict with vertex-side locations).

### Fragment output is always `d.vec4f`

Even for formats with fewer than 4 channels (`r8unorm`, `rg16float`), the output is still `d.vec4f`. WebGPU drops unused channels.

```ts
const luminanceFrag = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})((input) => d.vec4f(luma(input.uv), 0, 0, 1));

root.createRenderPipeline({
  vertex, fragment: luminanceFrag,
  targets: { format: 'r8unorm' }, // only the red channel is written
});
```

This is a WebGPU rule, not a TypeGPU one - but it surprises people used to frameworks that derive output types from texture formats.

---

## `common.fullScreenTriangle`

A helper for fullscreen post-processing - a single oversized triangle covering the viewport, no vertex buffer needed.

```ts
import { common } from 'typegpu';

const pipeline = root.createRenderPipeline({
  vertex: common.fullScreenTriangle,
  fragment: tgpu.fragmentFn({ in: { uv: d.vec2f }, out: d.vec4f })((input) => {
    'use gpu';
    return std.textureSample(screenTex.$, sampler.$, input.uv);
  }),
  targets: { format: presentationFormat },
});

pipeline.withColorAttachment({ view: context }).draw(3);
```

---

## Resolve API (WGSL code generation)

Generate the complete WGSL for a set of functions/pipelines - useful for debugging or integrating with other tools:

```ts
const wgsl = tgpu.resolve([pipeline]);
console.log(wgsl);
```

All transitive dependencies (helpers, layouts, buffers, constants) are included automatically.
