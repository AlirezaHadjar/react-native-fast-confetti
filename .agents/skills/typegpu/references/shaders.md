# TypeGPU Shader Authoring

## `tgpu.fn` vs plain callback

| | Plain callback | `tgpu.fn` |
|---|---|---|
| Types | Inferred at call sites | Declared explicitly |
| Polymorphism | One function, many WGSL variants | One fixed signature |
| Overloads | Yes (union types, branch pruning) | No |
| Best for | Helper math, flexible utilities, user-facing APIs | Library code, explicit dependencies, functions used in bind group layouts |

```ts
// Plain callback - one function, separate WGSL overloads per call-site type combination:
const scale = (v: d.v2f | d.v3f, factor: number) => {
  'use gpu';
  return v * factor;
};

// tgpu.fn - always one WGSL function:
const scale2D = tgpu.fn([d.vec2f, d.f32], d.vec2f)((v, factor) => {
  'use gpu';
  return v * factor;
});
```

---

## Polymorphism and branch pruning

TypeGPU generates one WGSL overload per unique call-site type combination (`number` and any union type). For union-typed parameters, `.kind` checks let you prune branches per type at compile time:

```ts
const area = (shape: d.v2f | d.v3f): number => {
  'use gpu';
  const base = shape.x * shape.y; // .x and .y are on both
  if (shape.kind === 'vec2f') {
    return base;                  // only in the vec2f overload
  } else {
    return base * shape.z;        // only in the vec3f overload
  }
};

area(d.vec2f(3, 4));    // fn area_vec2f(shape: vec2f) -> f32 { return shape.x * shape.y; }
area(d.vec3f(3, 4, 5)); // fn area_vec3f(shape: vec3f) -> f32 { return shape.x * shape.y * shape.z; }
```

Branch pruning also applies to compile-time-known captured values - `if` conditions resolvable at compile time keep only the winning branch in WGSL. This is how you write configurable shaders with no runtime overhead.

> **Caution:** each unique type combination generates a new WGSL function. Calling the same polymorphic function with many signatures bloats output. Use `tgpu.fn` to pin the signature when polymorphism isn't needed.

---

## Syntax limitations inside `'use gpu'`

| Unsupported | Alternative |
|---|---|
| `a ? b : c` (runtime ternary) | `std.select(falseVal, trueVal, condition)` |
| Object/array spreading (`{...obj}`) | Build the result manually |
| Inline functions / arrow fns | Define outside and capture |
| Most Web APIs | Compile-time constants only (`Math.PI` is fine) |
| `console.log` in vertex shaders | Fragment/compute only; has significant cost |
| `async`/`await`, `Promise` | Not supported |
| `try`/`catch` | Not supported |
| `let x;` without initializer | `let x = d.f32(0)` - type must be inferrable |

---

## Register pressure

When the GPU runs out of registers per thread it spills to slow memory, which can crater performance. Modern shader compilers (LLVM, SPIR-V, DXC) are smart — SSA optimisation means naming an intermediate `const` costs nothing, and aggressive inlining erases function-call boundaries before register allocation. Don't contort your code trying to outsmart them.

The one thing compilers can't fix: **variable liveness**. A `mat4x4f` holds 16 registers for its entire live range. If you compute it at the top of a function and only use it at the bottom, those registers are locked out for everything in between. Compute large values close to where they're consumed.

Vector ops and swizzles are still the right style — not because they pack registers differently (modern GPU hardware is scalar underneath), but because they express the math directly and let the compiler see the whole operation at once.

---

## Arithmetic operators

With `tsover`, `+ - * / %` work on scalars, vectors, and matrices. Infix methods (`.add()`, `.mul()`) and `std` functions (`std.dot`, `std.mod`) are alternatives.

```ts
const a = d.vec3f(1, 2, 3);
const b = d.vec3f(4, 5, 6);
const sum  = a + b;         // vec3f(5, 7, 9)
const prod = a * 2;         // vec3f(2, 4, 6) - scalar broadcast
const dot  = std.dot(a, b); // 32
```

Division on primitives defaults to `f32`. Integer division: `d.i32(10 / 3)`.

---

## Numeric literal gotcha

`.0` suffixes may be stripped by bundlers before transpilation:

```ts
let x = 1.0;       // BAD: "1.0" may become "1" -> abstract integer / i32
let x = d.f32(1);  // OK
let y = 1.1;       // OK - fractional part prevents integer interpretation
```

---

## Do not assign textures or samplers to variables - use them directly

```ts
const myTex = layout.$.sampledTex; // BAD
const color = std.textureSample(myTex, layout.$.sampler, uv);
```

```ts
const color = std.textureSample(layout.$.sampledTex, layout.$.sampler, uv); // GOOD
```

---

## Iteration

### `for...of`

Compiles to a WGSL loop. Loop variable must be `const`; the iterable must be in a variable (not inline).

```ts
for (const item of items.$) {
  process(item);
}
```

### `std.range` - numeric ranges for loops

Generates a sequence of integers. Three forms:

```ts
std.range(end)                // [0, 1, ..., end-1]
std.range(start, end)         // [start, start+1, ..., end-1]
std.range(start, end, step)   // [start, start+step, ...] while < end
```

Used directly in `for...of`, compiles to a WGSL `for` loop:

```ts
for (const i of std.range(0, 8, 2)) {
  result += data.$[i];
}
// -> for (var i = 0i; i < 8i; i += 2i) { ... }
```

Descending ranges work with negative step: `std.range(10, -10, -1)`.

### `tgpu.unroll` (compile-time loop unrolling)

Wrap the iterable of a `for...of` loop with `tgpu.unroll(...)` to inline every iteration as straight-line WGSL. Useful for small fixed counts where you want the compiler to see straight-line code.

```ts
for (const dy of tgpu.unroll([-1, 0, 1])) {
  for (const dx of tgpu.unroll([-1, 0, 1])) {
    processNeighbor(cell + d.vec2i(dx, dy));
  }
}
```

Hard rules: **no `continue` or `break` inside an unrolled loop**, and the length must be known at compile time.

**Warning — register spill.** Unrolling generates straight-line code, and the GPU register file is finite. Too many iterations means the compiler spills registers to slow memory, which can tank performance worse than the loop overhead you were avoiding. As a rough ceiling: **keep unrolled counts under ~8–16 for anything inside a hot shader; ~27 is an upper bound.** If you find yourself unrolling more than that, a regular `for...of` with `std.range` is almost certainly the better call.

#### Unrolling a numeric range

`tgpu.unroll(std.range(...))` unrolls the range at compile time instead of generating a runtime loop:

```ts
const FBM_OCTAVES = 3;

for (const i of tgpu.unroll(std.range(FBM_OCTAVES))) {
  sum += noise3d(pos * (FREQ * LACUNARITY ** i)) * (AMP * PERSISTENCE ** i);
}
```

`i` is a comptime JS number per iteration, so `LACUNARITY ** i` folds into literals.

#### Supported iterables

| Form | Example | Notes |
|---|---|---|
| Inline primitive array | `tgpu.unroll([1, 2, 3])` | Each element inlined as a literal |
| `std.range(n)` | `tgpu.unroll(std.range(N))` | Same category as primitive array |
| Inline array of complex values | `tgpu.unroll([b1, b2])` | Elements **must be stored in variables first** - fresh constructors inside the literal throw |
| Vector | `tgpu.unroll(d.vec3f(v))` | Iterates components: `v[0u]`, `v[1u]`, ... |
| Array of struct keys | `tgpu.unroll(Object.keys(obj) as ...)` | Iterate `obj[key]`; each access folded at compile time |
| Iterable in a variable | `const arr = [1,2,3]; tgpu.unroll(arr)` | Indexed access into WGSL `array<...>` - still unrolled |
| Buffers / accessors / `const` / `comptime` | `tgpu.unroll(acc.$)` | Works whenever length is known at compile time |

#### Conditional unrolling

Branch on a JS-side flag to pick between unrolled and regular - both branches are statically resolved, only one survives in WGSL:

```ts
const shouldUnroll = true;

for (const x of shouldUnroll ? tgpu.unroll(arr) : arr) {
  r += x;
}
```

---

## Arrays inside shaders

Declare mutable fixed-size local arrays with `d.arrayOf(dtype, count)(initialData)`:

```ts
const accum = d.arrayOf(d.f32, N)();     // zero-initialized
const vecs  = d.arrayOf(d.vec2f, 3)([    // with initial values
  d.vec2f(1, 2), d.vec2f(3, 4), d.vec2f(5, 6)
]);
```

Do not call `Array.from` or create arrow functions inside the shader body.

---

## `tgpu.comptime`

Evaluates an expression at compile time and embeds the result as a WGSL constant. Useful for turning CPU-side constants (colours, config, LUTs) into typed GPU values without buffers.

```ts
const color = tgpu.comptime((hex: number) => {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  return d.vec3f(r / 255, g / 255, b / 255);
});

const material = tgpu.fn([d.vec3f], d.vec3f)((diffuse) => {
  'use gpu';
  const albedo = color(0xff00ff); // evaluated at compile time -> const vec3f(1, 0, 1)
  return albedo * diffuse;
});
```

The function passed to `tgpu.comptime` runs in JS - any JS APIs are fair game, but the return value must be a schema-typed value TypeGPU can embed. Comptime calls are not cached - each call is evaluated separately.

---

## Shader entrypoints

### `tgpu.computeFn`

```ts
tgpu.computeFn({
  workgroupSize: [64],
  in: {
    gid:  d.builtin.globalInvocationId,   // vec3u
    lid:  d.builtin.localInvocationId,    // vec3u
    wgid: d.builtin.workgroupId,          // vec3u
    lidx: d.builtin.localInvocationIndex, // u32
    nwg:  d.builtin.numWorkgroups,        // vec3u
  },
})((input) => { 'use gpu'; });
```

### `tgpu.vertexFn`

```ts
tgpu.vertexFn({
  in: {
    position: d.vec3f,                    // from vertex layout attribs
    vid:      d.builtin.vertexIndex,      // u32 - NOT wired through attribs
    iid:      d.builtin.instanceIndex,    // u32
  },
  out: {
    position: d.builtin.position,         // vec4f, required
    fragUv:   d.vec2f,                    // inter-stage varying
  },
})((input) => { 'use gpu'; return { position: ..., fragUv: ... }; });
```

### `tgpu.fragmentFn`

```ts
tgpu.fragmentFn({
  in: {
    fragUv:      d.vec2f,                 // must match vertex out (excluding position)
    frontFacing: d.builtin.frontFacing,   // bool
    sampleIndex: d.builtin.sampleIndex,   // u32
  },
  out: d.vec4f,        // single output
  // named outputs: { outColor: d.vec4f, outNormal: d.vec4f }
})((input) => { 'use gpu'; return d.vec4f(...); });
```

---

## Outer-scope capture

Values from JS scope are inlined as WGSL constants at first compilation - feature for configuration, bug when you expect JS changes to affect the shader:

```ts
let threshold = 0.5;
const check = (x: number) => { 'use gpu'; return x > threshold; };
// threshold compiled as `const threshold: f32 = 0.5;`
// Later: threshold = 0.8; - has NO effect on the shader
```

Anything that changes at runtime must go through a buffer, uniform, slot, or accessor.

---

## `std` standard library

`std` wraps WGSL built-in functions ([WGSL spec section 16](https://www.w3.org/TR/WGSL/#builtin-functions)) plus some TypeGPU additions. The WGSL documentation applies.

```ts
import { std } from 'typegpu';
```

**Math**
```ts
std.abs   std.sign   std.floor   std.ceil   std.round   std.fract   std.trunc
std.sqrt  std.inverseSqrt
std.exp   std.exp2   std.log   std.log2   std.pow
std.min   std.max   std.clamp(x, lo, hi)
std.mix(a, b, t)              // linear interpolation
std.smoothstep(edge0, edge1, x)
std.step(edge, x)
std.select(falseVal, trueVal, cond)
```

**Trig**
```ts
std.sin  std.cos  std.tan  std.asin  std.acos  std.atan  std.atan2
std.sinh std.cosh std.tanh  std.degrees  std.radians
```

**Vector / matrix**
```ts
std.dot(a, b)         std.cross(a, b)      std.length(v)
std.normalize(v)      std.distance(a, b)
std.reflect(i, n)     std.refract(i, n, eta)
std.faceForward(n, i, nRef)
std.mul(mat, vec)     // matrix-vector multiply
```

**Texture** (see sampling rules below)
```ts
std.textureSample(view.$, sampler.$, uv)
std.textureSampleLevel(view.$, sampler.$, uv, mipLevel)
std.textureSampleGrad(view.$, sampler.$, uv, ddx, ddy)
std.textureLoad(view.$, coords, mipLevel)
std.textureStore(storageView.$, coords, value)
std.textureDimensions(view.$)
```

**Atomic**
```ts
std.atomicLoad(ptr)         std.atomicStore(ptr, val)
std.atomicAdd(ptr, val)     std.atomicSub(ptr, val)
std.atomicMin(ptr, val)     std.atomicMax(ptr, val)
std.atomicAnd(ptr, val)     std.atomicOr(ptr, val)     std.atomicXor(ptr, val)
std.atomicExchange(ptr, val)
std.atomicCompareExchangeWeak(ptr, cmp, val)
```

**Packing**
```ts
std.pack4x8snorm(v)   std.unpack4x8snorm(x)
std.pack4x8unorm(v)   std.unpack4x8unorm(x)
std.pack2x16snorm(v)  std.unpack2x16snorm(x)
std.pack2x16unorm(v)  std.unpack2x16unorm(x)
std.pack2x16float(v)  std.unpack2x16float(x)
```

---

## Texture sampling rules

Sampling function reference table: see `references/textures.md`.

- `textureSample` fails with a WGSL validation error if called inside a branch/loop whose condition depends on per-pixel data (fragment-only, must be uniform).
- `textureSampleLevel` does **not** use implicit derivatives — pass `0` for single-mip textures, or the level you want. Any stage, non-uniform OK.
- `textureSampleGrad` is the way to get auto-LOD in compute or non-uniform branches.

---

## `console.log` in shaders

Supported in fragment and compute (not vertex); injects atomics for thread-safe output - **significant overhead**, debug only.

```ts
const debugCompute = tgpu.computeFn({ workgroupSize: [1] })(() => {
  'use gpu';
  console.log('thread reached here', someValue);
});
```

---

## GPU-scoped variables

Declared at module scope; persistent for the shader's lifetime.

```ts
// Shared across all threads in a workgroup (compute only):
const sharedAccum = tgpu.workgroupVar(d.arrayOf(d.f32, 64));

// Thread-private — each thread gets its own copy:
const threadState = tgpu.privateVar(d.vec3f);

// Compile-time constant — embedded as a WGSL literal:
const PI_OVER_2 = tgpu.const(d.f32, Math.PI / 2);
```

Access via `sharedAccum.$`, `threadState.$`, `PI_OVER_2.$`. Workgroup vars require a barrier (`std.workgroupBarrier()`) before reading results written by other threads.

---

## Values vs references in `'use gpu'` code

**The single most common source of `ResolutionError` in hand-written shaders.**

**Mental model.** Scalars (`d.f32`, `number`, `boolean`) behave as values. Composites (vectors, matrices, structs, arrays) behave as **references** — a variable holding a `d.vec3f` is a handle to a memory location, not a bag of numbers. Reading is free; writing a component (`v.x = 1`) mutates the location.

**The extra rule.** A reference can be aliased with `const`, or copied with its schema constructor, but it cannot bind to `let` or be assigned with `=`. TypeGPU forces the ambiguity ("rebind or mutate through?") to be resolved at the binding site:

```ts
const startPoint = d.vec2f(1, 2);

let endPoint = startPoint;           // BAD: "references cannot be assigned"
let endPoint = d.vec2f(startPoint);  // OK: copy - fresh, independent, reassignable
const endPoint = startPoint;         // OK: alias - same memory, not reassignable
```

Same rule for reassignment and returning a parameter directly:

```ts
outColor = d.vec3f(spriteRgb);   // OK - not: outColor = spriteRgb
return d.vec3f(baseColor);       // OK when baseColor is a parameter
```

**Expression results are ephemeral and safe.** Constructor calls, arithmetic, function returns, and literals aren't named storage, so `let`/`const`/assignment/arguments/returns all work:

```ts
let p = d.vec2f(0);                 // constructor result
p = input.uv * 2 + d.vec2f(1, 0);  // expression result
let q = computeOffset();            // function return
```

The "must copy" rule only kicks in when the right-hand side is itself a named reference (local variable, struct field, array element, function parameter). **Fix:** wrap in the schema constructor (`d.vec2f(v)`, `d.mat4x4f(m)`, `MyStruct(other)`), or swap `let` for `const` if you don't need to reassign.

---

## Idiomatic shader code

**Prefer vector operations over component decomposition.** With `tsover`, `+ - * / %` work on vectors and matrices directly, and scalar broadcast applies to all four arithmetic operators:

```ts
// GOOD - clean vector math:
let uv = input.uv * d.vec2f(0.3, 0.2) + 0.5;
let offset = direction * speed;
let color = baseColor * intensity + ambient;

// BAD - unnecessary decomposition:
let uvX = input.uv.x * 0.3 + 0.5;
let uvY = input.uv.y * 0.2 + 0.5;
let uv = d.vec2f(uvX, uvY);
```

**Struct constructors work inside shaders** — build the whole struct locally and assign once rather than mutating fields one by one on a storage buffer:

```ts
const Particle = d.struct({ pos: d.vec2f, vel: d.vec2f, life: d.f32 });

// GOOD - single write to global memory:
const newP = Particle({
  pos: oldP.pos + oldP.vel * dt,
  vel: oldP.vel * 0.99,
  life: oldP.life - dt,
});
particles.$[idx] = Particle(newP);

// BAD - multiple global memory round-trips:
particles.$[idx].pos = particles.$[idx].pos + particles.$[idx].vel * dt;
particles.$[idx].vel.x = particles.$[idx].vel.x * 0.99;
particles.$[idx].life = particles.$[idx].life - dt;
```

Struct constructor forms: `MyStruct()` (zero-init), `MyStruct({ field: value, ... })` (named fields), `MyStruct(otherInstance)` (copy). Both patterns also minimise **register pressure** — see the "Register pressure" section above.
