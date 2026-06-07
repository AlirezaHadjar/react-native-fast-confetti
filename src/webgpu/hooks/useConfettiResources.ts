import { Skia, ImageFormat } from '@shopify/react-native-skia';
import { tgpu } from 'typegpu';

import type { SizeVariation } from '../../hooks/useConfettiFlakes';
import type { Spawn } from '../utils';
import {
  computeSizeFlags,
  toRuntimeInputs,
  toSizeInputs,
  toSpawnInputs,
} from '../resourcePacking';
import {
  ComputeSpawnsSchema,
  PaletteArraySchema,
  RuntimeArraySchema,
  SizeArraySchema,
  UniformsSchema,
  computeLayout,
  renderLayout,
} from '../shaders/confetti';

// `createImageBitmap` is installed on globalThis by react-native-wgpu.
export type NativeImageBitmap = unknown;

declare const createImageBitmap: (
  source: ArrayBuffer | ArrayBufferView
) => Promise<NativeImageBitmap>;

const HEX_TO_RGBA = (hex: string): [number, number, number, number] => {
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

export type ConfettiResourcesInput = {
  device: GPUDevice;
  count: number;
  sizeVariations: SizeVariation[];
  allColors: string[];
  spawns: Spawn[];
  cycleDuration: number;
};

const createConfettiResourcesImpl = async ({
  device,
  count,
  sizeVariations,
  allColors,
  spawns,
  cycleDuration,
}: ConfettiResourcesInput) => {
  const root = tgpu.initFromDevice({ device, unstable_names: 'strict' });
  const maxFlakeWidth = Math.max(...sizeVariations.map((s) => s.width));
  const maxFlakeHeight = Math.max(...sizeVariations.map((s) => s.height));

  const sizeFlags = computeSizeFlags(sizeVariations);

  const uniforms = root.createUniform(UniformsSchema);
  const spawnsBuffer = root.createReadonly(
    ComputeSpawnsSchema(count),
    toSpawnInputs(spawns)
  );
  const runtimeBuffer = root.createMutable(
    RuntimeArraySchema(count),
    toRuntimeInputs(spawns, cycleDuration)
  );
  const sizesBuffer = root.createReadonly(
    SizeArraySchema(sizeVariations.length),
    toSizeInputs(sizeVariations, sizeFlags)
  );
  const paletteBuffer = root.createReadonly(
    PaletteArraySchema(Math.max(1, allColors.length)),
    toPaletteInputs(allColors)
  );

  // Texture upload stays raw because react-native-wgpu owns the native bitmap
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
  });

  return {
    root,
    device,
    uniforms,
    spawnsBuffer,
    runtimeBuffer,
    sizesBuffer,
    paletteBuffer,
    computeBindGroup,
    renderBindGroup,
    texturesArray,
    sampler,
    count,
    cycleDuration,
    maxFlakeWidth,
    maxFlakeHeight,
  };
};

export type ConfettiResources = Awaited<
  ReturnType<typeof createConfettiResourcesImpl>
>;

export const createConfettiResources = createConfettiResourcesImpl;

export const updateConfettiRuntimeResources = (
  resources: ConfettiResources,
  spawns: Spawn[],
  cycleDuration: number
): boolean => {
  if (spawns.length !== resources.count) {
    return false;
  }

  resources.spawnsBuffer.write(toSpawnInputs(spawns));
  resources.runtimeBuffer.write(toRuntimeInputs(spawns, cycleDuration));
  resources.cycleDuration = cycleDuration;
  return true;
};

export const destroyConfettiResources = (r: ConfettiResources) => {
  r.root.destroy();
  r.texturesArray.destroy();
};
