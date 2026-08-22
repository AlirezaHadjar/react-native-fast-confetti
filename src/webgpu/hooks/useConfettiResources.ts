import { Skia, ImageFormat } from '@shopify/react-native-skia';
import { tgpu } from 'typegpu';

import type {
  ColorRange,
  SizeVariation,
} from '../../hooks/useConfettiFlakes';
import {
  computeSizeFlags,
  SIZE_FLAG_SHAPE_MASK,
  toInitSizeInputs,
  toSizeInputs,
} from '../resourcePacking';
import {
  ComputeSpawnsSchema,
  InitSizeArraySchema,
  InitUniformsSchema,
  PaletteArraySchema,
  RuntimeArraySchema,
  SizeArraySchema,
  UniformsSchema,
  computeLayout,
  initLayout,
  renderLayout,
} from '../shaders/confetti';
import type { FixedLengthArray } from '../../typeHelpers';

// `createImageBitmap` is installed on globalThis by react-native-webgpu.
export type NativeImageBitmap = unknown;

declare const createImageBitmap: (
  source: ArrayBuffer | ArrayBufferView
) => Promise<NativeImageBitmap>;

const HEX_TO_RGBA = (hex: string): FixedLengthArray<number, 4> => {
  const c = Skia.Color(hex);
  return [c[0] ?? 0, c[1] ?? 0, c[2] ?? 0, c[3] ?? 1];
};

export const toPaletteInputs = (colors: string[]) =>
  (colors.length > 0 ? colors : ['#ffffff']).map(HEX_TO_RGBA);

export const rasterizeFlakeTextures = async (
  sizes: SizeVariation[],
  maxWidth: number,
  maxHeight: number
): Promise<NativeImageBitmap[]> => {
  const layers: NativeImageBitmap[] = [];
  for (const size of sizes) {
    if (!size.texture) continue;
    const w = Math.max(1, Math.round(maxWidth));
    const h = Math.max(1, Math.round(maxHeight));
    const surface = Skia.Surface.MakeOffscreen(w, h);
    if (!surface) continue;
    const canvas = surface.getCanvas();
    canvas.clear(Skia.Color('transparent'));
    const sx = w / size.width;
    const sy = h / size.height;
    const s = Math.min(sx, sy);
    const offsetX = (w - size.width * s) / 2;
    const offsetY = (h - size.height * s) / 2;
    canvas.save();
    canvas.translate(offsetX, offsetY);
    canvas.scale(s, s);
    if (size.texture.type === 'svg') {
      canvas.drawSvg(size.texture.content, size.width, size.height);
    } else {
      const img = size.texture.content;
      const srcRect = Skia.XYWHRect(0, 0, img.width(), img.height());
      const dstRect = Skia.XYWHRect(0, 0, size.width, size.height);
      const paint = Skia.Paint();
      canvas.drawImageRect(img, srcRect, dstRect, paint);
    }
    canvas.restore();
    surface.flush();
    const snapshot = surface.makeImageSnapshot();
    const bytes = snapshot.encodeToBytes(ImageFormat.PNG, 100);
    const bitmap = await createImageBitmap(bytes.buffer as ArrayBuffer);
    layers.push(bitmap);
  }
  return layers;
};

const MASK_TEXTURE_SCALE = 2;

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
      const dist =
        size.radius <= 0
          ? -1
          : roundedRectDistance(px, py, halfWidth, halfHeight, size.radius);
      const alpha =
        size.radius <= 0 ? 1 : 1 - smoothstep(-aa, aa, dist);
      const offset = rowOffset + x * 4;
      data[offset] = 255;
      data[offset + 1] = 255;
      data[offset + 2] = 255;
      data[offset + 3] = Math.round(alpha * 255);
    }
  }

  return data;
};

export const createShapeMasksTexture = (
  device: GPUDevice,
  sizes: SizeVariation[],
  flags: number[],
  maxWidth: number,
  maxHeight: number
) => {
  const maskW = Math.max(1, Math.round(maxWidth * MASK_TEXTURE_SCALE));
  const maskH = Math.max(1, Math.round(maxHeight * MASK_TEXTURE_SCALE));
  const layerCount = Math.max(1, sizes.length);
  const bytesPerPixel = 4;
  const unpaddedBytesPerRow = maskW * bytesPerPixel;
  const bytesPerRow = Math.ceil(unpaddedBytesPerRow / 256) * 256;

  const texture = device.createTexture({
    size: [maskW, maskH, layerCount],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    dimension: '2d',
  });

  for (let i = 0; i < layerCount; i++) {
    const size = sizes[i] ?? sizes[0];
    const hasShapeMask = ((flags[i] ?? 0) & SIZE_FLAG_SHAPE_MASK) !== 0;
    const data =
      size && hasShapeMask
        ? createShapeMaskLayer(size, maskW, maskH, bytesPerRow)
        : createShapeMaskLayer(
            {
              width: maxWidth,
              height: maxHeight,
              radius: 0,
              flakeStyle: 'solid',
            },
            maskW,
            maskH,
            bytesPerRow
          );
    device.queue.writeTexture(
      { texture, origin: [0, 0, i] },
      data,
      { bytesPerRow, rowsPerImage: maskH },
      [maskW, maskH, 1]
    );
  }

  return texture;
};

export type ConfettiResourcesInput = {
  device: GPUDevice;
  count: number;
  sizeVariations: SizeVariation[];
  allColors: string[];
  colorOverrides: (ColorRange | null)[];
  parentColorCount: number;
};

const createConfettiResourcesImpl = async ({
  device,
  count,
  sizeVariations,
  allColors,
  colorOverrides,
  parentColorCount,
}: ConfettiResourcesInput) => {
  const root = tgpu.initFromDevice({ device, unstable_names: 'strict' });
  const maxFlakeWidth = Math.max(...sizeVariations.map((s) => s.width));
  const maxFlakeHeight = Math.max(...sizeVariations.map((s) => s.height));

  const sizeFlags = computeSizeFlags(sizeVariations);

  const uniforms = root.createUniform(UniformsSchema);
  const initUniforms = root.createUniform(InitUniformsSchema);
  const spawnsBuffer = root.createMutable(ComputeSpawnsSchema(count));
  const runtimeBuffer = root.createMutable(RuntimeArraySchema(count));
  const sizesBuffer = root.createReadonly(
    SizeArraySchema(sizeVariations.length),
    toSizeInputs(sizeVariations, sizeFlags)
  );
  const initSizesBuffer = root.createReadonly(
    InitSizeArraySchema(sizeVariations.length),
    toInitSizeInputs(
      sizeVariations,
      sizeFlags,
      colorOverrides,
      parentColorCount
    )
  );
  const paletteBuffer = root.createReadonly(
    PaletteArraySchema(Math.max(1, allColors.length)),
    toPaletteInputs(allColors)
  );
  const shapeMasksArray = createShapeMasksTexture(
    device,
    sizeVariations,
    sizeFlags,
    maxFlakeWidth,
    maxFlakeHeight
  );

  // Texture upload stays raw because react-native-webgpu owns the native bitmap
  // bridge; TypeGPU owns the shader-visible buffer and bind-group state.
  const texturedSizes = sizeVariations.filter((s) => !!s.texture);
  const texLayerCount = Math.max(1, texturedSizes.length);
  const texW = Math.max(1, Math.round(maxFlakeWidth));
  const texH = Math.max(1, Math.round(maxFlakeHeight));
  const texturesArray = device.createTexture({
    size: [texW, texH, texLayerCount],
    format: 'rgba8unorm',
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.RENDER_ATTACHMENT,
    dimension: '2d',
  });
  if (texturedSizes.length > 0) {
    const bitmaps = await rasterizeFlakeTextures(sizeVariations, texW, texH);
    for (let i = 0; i < bitmaps.length; i++) {
      device.queue.copyExternalImageToTexture(
        { source: bitmaps[i]! as GPUImageCopyExternalImage['source'] },
        { texture: texturesArray, origin: [0, 0, i] },
        [texW, texH, 1]
      );
    }
  }

  const sampler = device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  });

  const initBindGroup = root.createBindGroup(initLayout, {
    uniforms: initUniforms.buffer,
    spawns: spawnsBuffer.buffer,
    runtime: runtimeBuffer.buffer,
    sizes: initSizesBuffer.buffer,
  });

  const computeBindGroup = root.createBindGroup(computeLayout, {
    uniforms: uniforms.buffer,
    spawns: spawnsBuffer.buffer,
    runtime: runtimeBuffer.buffer,
  });
  const renderBindGroup = root.createBindGroup(renderLayout, {
    uniforms: uniforms.buffer,
    spawns: spawnsBuffer.buffer,
    runtime: runtimeBuffer.buffer,
    sizes: sizesBuffer.buffer,
    palette: paletteBuffer.buffer,
    sampler,
    textures: texturesArray.createView({ dimension: '2d-array' }),
    shapeMasks: shapeMasksArray.createView({ dimension: '2d-array' }),
  });

  return {
    root,
    device,
    uniforms,
    initUniforms,
    spawnsBuffer,
    runtimeBuffer,
    sizesBuffer,
    initSizesBuffer,
    paletteBuffer,
    initBindGroup,
    computeBindGroup,
    renderBindGroup,
    texturesArray,
    shapeMasksArray,
    sampler,
    count,
    sizeVariations,
    allColors,
    colorOverrides,
    parentColorCount,
    maxFlakeWidth,
    maxFlakeHeight,
  };
};

export type ConfettiResources = Awaited<
  ReturnType<typeof createConfettiResourcesImpl>
>;

export const createConfettiResources = createConfettiResourcesImpl;
