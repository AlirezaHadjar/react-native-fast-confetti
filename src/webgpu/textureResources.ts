import {
  AlphaType,
  ColorType,
  Skia,
  type SkImage,
  type SkSVG,
} from '@shopify/react-native-skia';

import type { SizeVariation, TextureInfo } from '../hooks/useConfettiFlakes';
import {
  SIZE_FLAG_LAYER_MASK,
  SIZE_FLAG_MASK_LAYER_SHIFT,
  SIZE_FLAG_SHAPE_MASK,
  SIZE_FLAG_TEXTURED,
  SIZE_FLAG_TEXTURE_LAYER_SHIFT,
} from './resourcePacking';

const COPY_BYTES_PER_ROW_ALIGNMENT = 256;
const MASK_TEXTURE_SCALE = 2;
const MAX_CACHED_RASTERS_PER_TEXTURE = 4;
const MAX_CACHED_RASTER_BYTES_PER_TEXTURE = 8 * 1024 * 1024;

type RasterizedTexture = {
  data: Uint8Array;
  bytesPerRow: number;
};

const rasterizedTextureCache = new WeakMap<
  SkImage | SkSVG,
  Map<string, RasterizedTexture>
>();
const samplerCache = new WeakMap<GPUDevice, GPUSampler>();

const alignTo = (value: number, alignment: number) =>
  Math.ceil(value / alignment) * alignment;

const cacheRasterizedTexture = (
  texture: SkImage | SkSVG,
  cacheKey: string,
  rasterized: RasterizedTexture,
  existingCache?: Map<string, RasterizedTexture>
) => {
  if (rasterized.data.byteLength > MAX_CACHED_RASTER_BYTES_PER_TEXTURE) return;

  const cache = existingCache ?? new Map<string, RasterizedTexture>();
  let cachedBytes = Array.from(cache.values()).reduce(
    (total, entry) => total + entry.data.byteLength,
    0
  );
  while (
    cache.size >= MAX_CACHED_RASTERS_PER_TEXTURE ||
    cachedBytes + rasterized.data.byteLength >
      MAX_CACHED_RASTER_BYTES_PER_TEXTURE
  ) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) break;
    cachedBytes -= cache.get(oldestKey)?.data.byteLength ?? 0;
    cache.delete(oldestKey);
  }
  cache.set(cacheKey, rasterized);
  if (!existingCache) rasterizedTextureCache.set(texture, cache);
};

const getLayer = (flags: number, shift: number) =>
  (flags >> shift) & SIZE_FLAG_LAYER_MASK;

const copyWithAlignedRows = (
  pixels: Uint8Array,
  width: number,
  height: number
): RasterizedTexture => {
  const sourceBytesPerRow = width * 4;
  const bytesPerRow = alignTo(sourceBytesPerRow, COPY_BYTES_PER_ROW_ALIGNMENT);
  if (bytesPerRow === sourceBytesPerRow) {
    return { data: pixels, bytesPerRow };
  }

  const data = new Uint8Array(bytesPerRow * height);
  for (let row = 0; row < height; row++) {
    const sourceOffset = row * sourceBytesPerRow;
    data.set(
      pixels.subarray(sourceOffset, sourceOffset + sourceBytesPerRow),
      row * bytesPerRow
    );
  }
  return { data, bytesPerRow };
};

const rasterizeTexture = (
  texture: TextureInfo,
  width: number,
  height: number
): RasterizedTexture => {
  const cacheKey = `${texture.type}:${width}x${height}`;
  const cachedBySize = rasterizedTextureCache.get(texture.content);
  const cached = cachedBySize?.get(cacheKey);
  if (cached) {
    // Refresh insertion order so eviction behaves as a small per-asset LRU.
    cachedBySize?.delete(cacheKey);
    cachedBySize?.set(cacheKey, cached);
    return cached;
  }

  const surface = Skia.Surface.MakeOffscreen(width, height);
  if (!surface) {
    throw new Error('Unable to create an offscreen Skia texture surface');
  }

  try {
    const canvas = surface.getCanvas();
    canvas.clear(Skia.Color('transparent'));
    if (texture.type === 'svg') {
      canvas.drawSvg(texture.content, width, height);
    } else {
      const source = texture.content;
      const sourceRect = Skia.XYWHRect(0, 0, source.width(), source.height());
      const destinationRect = Skia.XYWHRect(0, 0, width, height);
      const paint = Skia.Paint();
      try {
        canvas.drawImageRect(source, sourceRect, destinationRect, paint);
      } finally {
        paint.dispose();
      }
    }

    surface.flush();
    const snapshot = surface.makeImageSnapshot();
    try {
      const pixels = snapshot.readPixels(0, 0, {
        width,
        height,
        colorType: ColorType.RGBA_8888,
        alphaType: AlphaType.Unpremul,
      });
      if (!(pixels instanceof Uint8Array)) {
        throw new Error('Unable to read RGBA pixels from the Skia texture');
      }

      const rasterized = copyWithAlignedRows(pixels, width, height);
      cacheRasterizedTexture(
        texture.content,
        cacheKey,
        rasterized,
        cachedBySize
      );
      return rasterized;
    } finally {
      snapshot.dispose();
    }
  } finally {
    surface.dispose();
  }
};

const collectUniqueLayers = (
  sizes: SizeVariation[],
  flags: number[],
  enabledFlag: number,
  shift: number
) => {
  const layers = new Map<number, SizeVariation>();
  for (let index = 0; index < sizes.length; index++) {
    const sizeFlags = flags[index] ?? 0;
    if ((sizeFlags & enabledFlag) === 0) continue;
    const size = sizes[index];
    if (size) layers.set(getLayer(sizeFlags, shift), size);
  }
  return layers;
};

export const prepareFlakeTexturesArray = (
  sizes: SizeVariation[],
  flags: number[]
) => {
  const layers = collectUniqueLayers(
    sizes,
    flags,
    SIZE_FLAG_TEXTURED,
    SIZE_FLAG_TEXTURE_LAYER_SHIFT
  );
  const texturedSizes = sizes.filter(
    (_, index) => ((flags[index] ?? 0) & SIZE_FLAG_TEXTURED) !== 0
  );
  const width =
    texturedSizes.length === 0
      ? 1
      : Math.max(...texturedSizes.map((size) => size.width));
  const height =
    texturedSizes.length === 0
      ? 1
      : Math.max(...texturedSizes.map((size) => size.height));
  const textureWidth = Math.max(1, Math.round(width));
  const textureHeight = Math.max(1, Math.round(height));
  const layerCount = Math.max(1, layers.size);
  const uploads = Array.from(layers, ([layer, size]) => {
    if (!size.texture) {
      throw new Error('A textured WebGPU layer is missing its source texture');
    }
    return {
      layer,
      rasterized: rasterizeTexture(size.texture, textureWidth, textureHeight),
    };
  });

  return { textureWidth, textureHeight, layerCount, uploads };
};

export const createFlakeTexturesArray = (
  device: GPUDevice,
  queue: GPUQueue,
  prepared: ReturnType<typeof prepareFlakeTexturesArray>
) => {
  const { textureWidth, textureHeight, layerCount, uploads } = prepared;
  const texture = device.createTexture({
    size: [textureWidth, textureHeight, layerCount],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    dimension: '2d',
  });

  try {
    for (const { layer, rasterized } of uploads) {
      queue.writeTexture(
        { texture, origin: [0, 0, layer] },
        rasterized.data,
        { bytesPerRow: rasterized.bytesPerRow, rowsPerImage: textureHeight },
        [textureWidth, textureHeight, 1]
      );
    }
    return texture;
  } catch (error) {
    texture.destroy();
    throw error;
  }
};

const smoothstep = (edge0: number, edge1: number, value: number) => {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

const roundedRectDistance = (
  x: number,
  y: number,
  halfWidth: number,
  halfHeight: number,
  radius: number
) => {
  const r = Math.min(radius, halfWidth, halfHeight);
  const qx = Math.abs(x) - (halfWidth - r);
  const qy = Math.abs(y) - (halfHeight - r);
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r;
};

const createShapeMaskLayer = (
  size: SizeVariation,
  width: number,
  height: number,
  bytesPerRow: number
) => {
  const data = new Uint8Array(bytesPerRow * height);
  const halfWidth = size.width * 0.5;
  const halfHeight = size.height * 0.5;
  const pixelWidth = size.width / width;
  const pixelHeight = size.height / height;
  const aa = Math.max(pixelWidth, pixelHeight);

  for (let y = 0; y < height; y++) {
    const v = (y + 0.5) / height;
    const py = (v - 0.5) * size.height;
    const rowOffset = y * bytesPerRow;
    for (let x = 0; x < width; x++) {
      const u = (x + 0.5) / width;
      const px = (u - 0.5) * size.width;
      const dist = roundedRectDistance(
        px,
        py,
        halfWidth,
        halfHeight,
        size.radius
      );
      data[rowOffset + x] = Math.round((1 - smoothstep(-aa, aa, dist)) * 255);
    }
  }

  return data;
};

export const prepareShapeMasksArray = (
  sizes: SizeVariation[],
  flags: number[]
) => {
  const layers = collectUniqueLayers(
    sizes,
    flags,
    SIZE_FLAG_SHAPE_MASK,
    SIZE_FLAG_MASK_LAYER_SHIFT
  );
  const maxWidth =
    layers.size === 0
      ? 0.5
      : Math.max(...Array.from(layers.values(), (size) => size.width));
  const maxHeight =
    layers.size === 0
      ? 0.5
      : Math.max(...Array.from(layers.values(), (size) => size.height));
  const width = Math.max(1, Math.round(maxWidth * MASK_TEXTURE_SCALE));
  const height = Math.max(1, Math.round(maxHeight * MASK_TEXTURE_SCALE));
  const layerCount = Math.max(1, layers.size);
  const bytesPerRow = alignTo(width, COPY_BYTES_PER_ROW_ALIGNMENT);
  const opaquePixel = new Uint8Array(bytesPerRow);
  opaquePixel[0] = 255;
  const uploads =
    layers.size === 0
      ? [{ layer: 0, data: opaquePixel }]
      : Array.from(layers, ([layer, size]) => ({
          layer,
          data: createShapeMaskLayer(size, width, height, bytesPerRow),
        }));

  return { width, height, layerCount, bytesPerRow, uploads };
};

export const createShapeMasksArray = (
  device: GPUDevice,
  queue: GPUQueue,
  prepared: ReturnType<typeof prepareShapeMasksArray>
) => {
  const { width, height, layerCount, bytesPerRow, uploads } = prepared;
  const texture = device.createTexture({
    size: [width, height, layerCount],
    format: 'r8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    dimension: '2d',
  });

  try {
    for (const { layer, data } of uploads) {
      queue.writeTexture(
        { texture, origin: [0, 0, layer] },
        data,
        { bytesPerRow, rowsPerImage: height },
        [width, height, 1]
      );
    }
    return texture;
  } catch (error) {
    texture.destroy();
    throw error;
  }
};

export const getLinearClampSampler = (device: GPUDevice) => {
  let sampler = samplerCache.get(device);
  if (!sampler) {
    sampler = device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    });
    samplerCache.set(device, sampler);
  }
  return sampler;
};
