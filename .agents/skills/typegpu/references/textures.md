# TypeGPU Textures

## Creating textures

```ts
const tex = root.createTexture({
  size:           [width, height],           // [w] | [w, h] | [w, h, depth]
  format:         'rgba8unorm',              // any GPUTextureFormat
  dimension?:     '1d' | '2d' | '3d',       // default: '2d'
  mipLevelCount?: number,                    // default: 1
  sampleCount?:   number,                    // default: 1 (4 for MSAA)
  viewFormats?:   GPUTextureFormat[],        // sRGB variants
});
```

## Usage flags

```ts
.$usage('sampled')  // TEXTURE_BINDING - read via textureSample/textureLoad
.$usage('storage')  // STORAGE_BINDING - read/write as storage texture
.$usage('render')   // RENDER_ATTACHMENT - render targets and resampling writes
```

Multiple: `.$usage('sampled', 'render')`.

---

## Writing data

```ts
// Accepts: ImageBitmap, ImageData, HTMLCanvasElement, HTMLVideoElement,
//          HTMLImageElement, or an array of them (for array textures).
await texture.write(imageBitmap);

// If source size != texture size, 'render' usage is required (TypeGPU resamples).
// If source size === texture size, 'render' is not needed.
```

---

## Mipmap generation

Requires `mipLevelCount > 1` and `'render'` usage.

```ts
texture.generateMipmaps();           // all levels from level 0
texture.generateMipmaps(1);          // levels 2, 3, ... from level 1
texture.generateMipmaps(0, 4);       // levels 1, 2, 3 from level 0
```

---

## Clearing

```ts
texture.clear();            // write zeros to all mip levels
texture.clear(mipLevel);    // specific mip level
```

---

## Texture views

Views expose a texture (or a subset) to shaders or render passes.

### Sampled views

```ts
texture.createView()                           // default: texture_2d<f32>
texture.createView(d.texture2d(d.f32))
texture.createView(d.texture2d(d.u32))
texture.createView(d.texture2d(d.i32))

texture.createView(d.texture2dArray(d.f32))
texture.createView(d.textureCube(d.f32))
texture.createView(d.textureCubeArray(d.f32))
texture.createView(d.texture3d(d.f32))
texture.createView(d.textureMultisampled2d(d.f32))
```

### Depth views

```ts
texture.createView(d.textureDepth2d())
texture.createView(d.textureDepth2dArray())
texture.createView(d.textureDepthCube())
texture.createView(d.textureDepthCubeArray())
texture.createView(d.textureDepthMultisampled2d())
```

### Storage texture views

```ts
texture.createView(d.textureStorage2d('rgba8unorm', 'write-only'))  // default access
texture.createView(d.textureStorage2d('rgba8unorm', 'read-only'))
texture.createView(d.textureStorage2d('rgba8unorm', 'read-write'))

// Also: d.textureStorage1d, d.textureStorage2dArray, d.textureStorage3d
```

### Render attachment view

```ts
const renderView = texture.createView('render');
```

> Cache view handles at setup - `createView(...)` inline is fine for prototypes but raises GC pressure at scale.

### View descriptor (subset of texture)

```ts
texture.createView(d.texture2d(d.f32), {
  baseMipLevel?:    number,
  mipLevelCount?:   number,
  baseArrayLayer?:  number,
  arrayLayerCount?: number,
  format?:          GPUTextureFormat,
  aspect?:          GPUTextureAspect,
  sampleType?:      'float' | 'unfilterable-float',
})
```

Example - bind a single layer of an array texture:

```ts
const arrayTex = root.createTexture({
  size: [256, 256, 4],
  format: 'rgba8unorm',
}).$usage('sampled');

const layout = tgpu.bindGroupLayout({ layer: { texture: d.texture2d() } });

const bindGroup = root.createBindGroup(layout, {
  layer: arrayTex.createView(d.texture2d(), { baseArrayLayer: 2, arrayLayerCount: 1 }),
});
```

---

## Samplers

```ts
const sampler = root.createSampler({
  addressModeU?: 'clamp-to-edge' | 'repeat' | 'mirror-repeat',
  addressModeV?: ...,
  addressModeW?: ...,
  magFilter?:    'nearest' | 'linear',
  minFilter?:    'nearest' | 'linear',
  mipmapFilter?: 'nearest' | 'linear',
  lodMinClamp?:  number,
  lodMaxClamp?:  number,
  compare?:      GPUCompareFunction,   // for comparison samplers
  maxAnisotropy?: number,              // 1-16
});
```

In bind group layouts: `{ sampler: 'filtering' | 'non-filtering' | 'comparison' }`.

---

## Using textures in shaders

### Sampling function reference

| Function | Stages | Control flow | Mip selection |
|---|---|---|---|
| `std.textureSample` | Fragment only | Must be uniform | Auto (implicit derivatives) |
| `std.textureSampleLevel` | Any | Non-uniform OK | Explicit mip level |
| `std.textureSampleGrad` | Any | Non-uniform OK | Auto via explicit derivatives |

```ts
const color = std.textureSample(layout.$.tex, layout.$.samp, uv);       // fragment, uniform
const color = std.textureSampleLevel(layout.$.tex, layout.$.samp, uv, 0); // any stage
const color = std.textureSampleGrad(layout.$.tex, layout.$.samp, uv, ddx, ddy); // explicit grads
```

### Sampled texture in a bind group

```ts
const layout = tgpu.bindGroupLayout({
  tex:  { texture: d.texture2d(d.f32) },
  samp: { sampler: 'filtering' },
});
// Shader: std.textureSample(layout.$.tex, layout.$.samp, uv)
```

### Storage texture (read/write without sampler)

```ts
const layout = tgpu.bindGroupLayout({
  output: { storageTexture: d.textureStorage2d('rgba8unorm', 'write-only') },
});
// Compute shader: std.textureStore(layout.$.output, coords, d.vec4f(r, g, b, 1));
```
