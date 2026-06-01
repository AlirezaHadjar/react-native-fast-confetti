# `@typegpu/noise` - Random Values, Distributions, and Perlin

**Always prefer this over hand-rolled hash functions or `fract(sin(...))` snippets** - those are fragile, biased, and a known source of banding/repetition artifacts.

```ts
import { randf, perlin2d, perlin3d } from '@typegpu/noise';
```

Works in TypeGPU shaders (auto-linked on pipeline resolve) and in raw WGSL via `tgpu.resolve({ template, externals: { randf } })`.

## PRNG (`randf`)

`randf.sample()` returns a uniform `f32` in `[0, 1)`. Each thread has its own generator state - **seed each thread differently** or they all produce the same sequence (usually a bug). Seed once at the top from something thread-unique (pixel position, global invocation id, hashed instance index).

```ts
const main = tgpu.fragmentFn({
  in: { pos: d.builtin.position },
  out: d.vec4f,
})(({ pos }) => {
  randf.seed2(pos.xy.mul(0.001)); // unique per pixel; keep magnitude small
  const r = randf.sample();
  const g = randf.sample();
  return d.vec4f(r, g, 0, 1);
});
```

**Seed magnitude matters.** Float precision means large seeds repeat quickly. Keep seeds in `[-1000, 1000]`, ideally `[0, 1]`. For pixel coordinates, multiply by `~0.001`; for global invocation ids, divide by dispatch size.

### Seed functions

| Function | Seed type |
|---|---|
| `randf.seed(x)` | `f32` |
| `randf.seed2(v)` | `d.v2f` |
| `randf.seed3(v)` | `d.v3f` |
| `randf.seed4(v)` | `d.v4f` |

Canonical compute-shader pattern: `seed2(globalInvocationId.xy / dispatchSize.xy)`.

## Distributions

Built on `randf.sample()` - they share the thread's PRNG state (no separate seeding).

### Discrete

| Function | Returns | Notes |
|---|---|---|
| `randf.bernoulli(p)` | `0` or `1` (as `f32`) | Biased coin flip; `p` in `[0, 1]` |

### Continuous

| Function | Returns | Notes |
|---|---|---|
| `randf.sample()` | `f32` in `[0, 1)` | Base PRNG |
| `randf.sampleExclusive()` | `f32` in `(0, 1)` | Use before `log` |
| `randf.normal(mu, sigma)` | `f32` ~ `N(mu, sigma)` | Box-Muller; `sigma > 0` |
| `randf.exponential(rate)` | `f32` >= 0 | `rate > 0` |
| `randf.cauchy(x0, gamma)` | `f32` | Heavy-tailed; `gamma > 0` |

### Geometric

Uniformly distributed vectors over shapes - bread and butter for path tracers, particle systems, AO, soft shadows.

| Function | Returns | Shape |
|---|---|---|
| `randf.inUnitCircle()` | `d.v2f` | Inside the unit disc |
| `randf.onUnitCircle()` | `d.v2f` | On the unit circle (perimeter) |
| `randf.inUnitCube()` | `d.v3f` | Inside the unit cube |
| `randf.onUnitCube()` | `d.v3f` | On the surface of the unit cube |
| `randf.inUnitSphere()` | `d.v3f` | Inside the unit sphere |
| `randf.onUnitSphere()` | `d.v3f` | On the unit sphere (uniform direction) |
| `randf.inHemisphere(normal)` | `d.v3f` | Inside the upper hemisphere |
| `randf.onHemisphere(normal)` | `d.v3f` | On the upper hemisphere |

For diffuse BRDF sampling: `onHemisphere(normal)`. For uniform direction (Monte Carlo over sphere): `onUnitSphere()`.

---

## Perlin noise

`perlin2d` and `perlin3d` return smooth gradient noise in `[-1, 1]`. Use for terrain, clouds, organic textures, FBM, domain warping.

```ts
import { perlin2d } from '@typegpu/noise';

const main = tgpu.fragmentFn({
  in: { pos: d.builtin.position },
  out: d.vec4f,
})(({ pos }) => {
  const n = perlin2d.sample(pos.xy.mul(0.05)); // "interesting" scale ~1 unit/cell
  return d.vec4f(n * 0.5 + 0.5, 0, 0, 1);     // remap [-1,1] to [0,1]
});
```

By default, `perlin*.sample` computes gradients on demand. For heavy sampling (FBM, derivatives, multi-octave warping), precompute into a buffer with the cache variants (~10x speedups).

### Static cache

Use when the noise domain size is fixed at compile time:

```ts
const cache = perlin3d.staticCache({
  root,
  size: d.vec3u(64, 64, 64),
});

const pipeline = root
  .pipe(cache.inject())
  .createComputePipeline({ compute: main });
```

Inside `main`, `perlin3d.sample(pos)` reads from the cache automatically - no shader code change. Sampling wraps at the domain boundary. Use `perlin2d.staticCache({ root, size: d.vec2u(...) })` for 2D.

### Dynamic cache

Use when domain size changes at runtime (e.g. LOD-driven terrain):

```ts
const cacheConfig = perlin3d.dynamicCacheConfig();
const dynamicLayout = tgpu.bindGroupLayout({ ...cacheConfig.layout });

const pipeline = root
  .pipe(cacheConfig.inject(dynamicLayout.$))
  .createComputePipeline({ compute: main });

const cache = cacheConfig.instance(root, d.vec3u(10, 10, 1));

function makeBindGroup(size: d.v3u) {
  cache.size = size;
  return root.createBindGroup(dynamicLayout, cache.bindings);
}

let bindGroup = makeBindGroup(d.vec3u(10, 10, 1));
pipeline.with(bindGroup).dispatchWorkgroups(1);

// Resize later - no shader recompile:
bindGroup = makeBindGroup(d.vec3u(64, 64, 32));
pipeline.with(bindGroup).dispatchWorkgroups(1);
```

**Prefer `staticCache` when the size is known at build time.** The dynamic path costs extra bind group layout, rebuild on resize, and slightly more expensive sampling.

### When NOT to cache

For small or one-off sampling (a few samples per fragment, no FBM), unconfigured `perlin*.sample` is already fast. Caching pays off for many samples per thread or across many threads.
