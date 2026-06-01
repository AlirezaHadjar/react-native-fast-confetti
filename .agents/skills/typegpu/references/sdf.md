# `@typegpu/sdf` - Signed Distance Functions and Operators

**Prefer this over hand-porting SDFs.** All functions are typed `tgpu.fn`s, composable with `typegpu/std`.

```ts
import * as sdf from '@typegpu/sdf';
// or selectively:
import { sdDisk, sdRoundedBox2d, opSmoothUnion } from '@typegpu/sdf';
```

## 2D primitives

All take `point: vec2f`, return `f32`.

| Function | Extra args | Notes |
|---|---|---|
| `sdDisk(point, radius)` | `radius: f32` | Filled circle |
| `sdBox2d(point, size)` | `size: vec2f` | Axis-aligned rect; `size` is **half-extent** |
| `sdRoundedBox2d(point, size, r)` | `size: vec2f, r: f32` | Rounded rect; `size` is half-extent |
| `sdLine(point, A, B)` | `A, B: vec2f` | **Unsigned** distance to segment `A->B` |
| `sdBezier(point, A, B, C)` | `A, B, C: vec2f` | Exact unsigned distance to quadratic Bezier |
| `sdBezierApprox(point, A, B, C)` | `A, B, C: vec2f` | Fast Bezier approx; cheaper, less accurate near cusps |
| `sdPie(point, sc, radius)` | `sc: vec2f, radius: f32` | Circular sector; `sc = vec2f(sin(halfAngle), cos(halfAngle))` - **precompute on CPU** |

> `sdLine`/`sdBezier`/`sdBezierApprox` return **unsigned** distance (no inside/outside for a curve). Draw AA strokes by comparing against half the stroke width.

## 3D primitives

All take `point: vec3f`, return `f32`.

| Function | Extra args | Notes |
|---|---|---|
| `sdSphere(point, radius)` | `radius: f32` | |
| `sdBox3d(point, size)` | `size: vec3f` | Half-extents |
| `sdRoundedBox3d(point, size, r)` | `size: vec3f, r: f32` | |
| `sdBoxFrame3d(point, size, thickness)` | `size: vec3f, thickness: f32` | Hollow frame (12 edges only) |
| `sdLine3d(point, A, B)` | `A, B: vec3f` | Unsigned distance to 3D segment |
| `sdCapsule(point, A, B, radius)` | `A, B: vec3f, radius: f32` | "Thick line segment" |
| `sdPlane(point, normal, h)` | `normal: vec3f, h: f32` | Infinite plane; `normal` **must be normalized** |

## Operators

| Operator | Signature | Purpose |
|---|---|---|
| `opUnion(d1, d2)` | `(f32, f32) -> f32` | Hard union (`min(d1, d2)`) |
| `opSmoothUnion(d1, d2, k)` | `(f32, f32, f32) -> f32` | Soft metaball union; `k` = blend radius |
| `opSmoothDifference(d1, d2, k)` | `(f32, f32, f32) -> f32` | Soft subtraction |
| `opExtrudeX(point, d2d, halfHeight)` | `(vec3f, f32, f32) -> f32` | Extrude 2D SDF into a prism along X |
| `opExtrudeY(point, d2d, halfHeight)` | `(vec3f, f32, f32) -> f32` | Along Y |
| `opExtrudeZ(point, d2d, halfHeight)` | `(vec3f, f32, f32) -> f32` | Along Z |

Intersection and sharp difference: use `std.max(d1, d2)` and `std.max(d1, -d2)` directly.

## Calling from shaders

Every function is a `tgpu.fn` with pinned types:
- Callable from plain-callback `'use gpu'` and other `tgpu.fn`s.
- First-class: pass into slots, accessors, or higher-order scene builders.
- **Not polymorphic** - `d.vec2f` for 2D, `d.vec3f` for 3D. TypeScript catches most mismatches.
- Non-vector args are plain `f32` - JS `number` literals work.

```ts
const mask = std.smoothstep(
  std.fwidth(uv.x),
  0,
  sdf.sdRoundedBox2d(uv - 0.5, d.vec2f(0.3, 0.1), 0.02),
);
```

`std.smoothstep(fwidth(uv.x), 0, d)` is the idiomatic 1-pixel AA mask from a 2D SDF in a fragment shader.

## Baking SDF fields into a texture

When the same SDF is sampled many times per frame (AA + normals + shadows + AO all hitting the scene function) and the field changes at most once per frame, **bake into a texture in a compute pass and sample everywhere else**:

```ts
const sdfTex = root.createTexture({
  size: [256, 128],
  format: 'rgba16float',
}).$usage('storage', 'sampled');

const writeView = sdfTex.createView(d.textureStorage2d('rgba16float', 'write-only'));

const bakePipeline = root.createGuardedComputePipeline((x, y) => {
  'use gpu';
  const size = std.textureDimensions(writeView.$);
  const uv = (d.vec2f(x, y) + 0.5) / d.vec2f(size);
  const worldPos = uvToWorld(uv);
  const dist = expensiveSceneSDF(worldPos);
  std.textureStore(writeView.$, d.vec2u(x, y), d.vec4f(dist, 0, 0, 1));
});

bakePipeline.dispatchThreads(256, 128);
```

Notes:
- **Signed format.** `r16float`/`rgba16float` preserves sign. `r8unorm` works only if you remap into `[0, 1]`.
- **Resolution.** Bilinear is fine for most uses; raise resolution before anything else if you see stepping.
- **Pack extra channels.** `rgba16float` can hold `(dist, progressAlongCurve, normalX, normalY)`.
- **Re-bake only when source geometry changes.** Static fields: bake once at startup.

## Bounding shapes for early-out

For unions over many sources (particles, agents, instanced obstacles), reject with a cheap bounding distance before expensive per-source calculation:

```ts
for (let i = d.u32(0); i < activeCount; i++) {
  const src = sources.$[i];
  const rough = std.length(point - src.center) - src.radius;
  if (rough * k > 7) { continue; } // exp(-k * rough) < 1e-3 past this
  const exact = expensiveSourceSDF(point, src);
  accum += std.exp(-k * exact);
}
```

Two common forms:
- **Skip-when-far.** `if (boundDist > cutoff) continue;` - bound must be a true lower bound.
- **Early ray-march termination.** Return the bound when far from geometry, exact distance only inside a broad region.

## Further reading

For SDFs the package doesn't ship (ellipse, torus, triangle, CSG over meshes):
- **2D:** https://iquilezles.org/articles/distfunctions2d/
- **3D:** https://iquilezles.org/articles/distfunctions/
- **Smooth min:** https://iquilezles.org/articles/smin/
