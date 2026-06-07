import { Skia, ImageFormat } from '@shopify/react-native-skia';

import type { SizeVariation } from '../../hooks/useConfettiFlakes';
import type { Spawn } from '../utils';
import {
  SIZE_META_BYTES,
  SPAWN_BYTES,
  RUNTIME_BYTES,
} from '../shaders/confetti';

// `createImageBitmap` is installed on globalThis by react-native-wgpu.
type NativeImageBitmap = unknown;

declare const createImageBitmap: (
  source: ArrayBuffer | ArrayBufferView
) => Promise<NativeImageBitmap>;

export type ConfettiResources = {
  device: GPUDevice;
  spawnsBuffer: GPUBuffer;
  runtimeBuffer: GPUBuffer;
  runtimeInitial: Float32Array;
  sizesBuffer: GPUBuffer;
  paletteBuffer: GPUBuffer;
  texturesArray: GPUTexture;
  sampler: GPUSampler;
  aliveBuffer: GPUBuffer;
  aliveReadback: GPUBuffer;
  count: number;
  cycleDuration: number;
  maxFlakeWidth: number;
  maxFlakeHeight: number;
};

const HEX_TO_RGBA = (hex: string): [number, number, number, number] => {
  const c = Skia.Color(hex);
  return [c[0] ?? 0, c[1] ?? 0, c[2] ?? 0, c[3] ?? 1];
};

export const computeSizeFlags = (sizes: SizeVariation[]): number[] => {
  const flags: number[] = [];
  let textureLayer = 0;
  for (const s of sizes) {
    let f = 0;
    if (s.flakeStyle === 'glossy') f |= 1;
    if (s.texture) {
      f |= 2;
      f |= (textureLayer & 0xffff) << 16;
      textureLayer++;
    }
    flags.push(f);
  }
  return flags;
};

const packSizes = (sizes: SizeVariation[], flags: number[]): Float32Array => {
  const buf = new Float32Array((SIZE_META_BYTES / 4) * sizes.length);
  for (let i = 0; i < sizes.length; i++) {
    const s = sizes[i]!;
    const base = i * (SIZE_META_BYTES / 4);
    buf[base + 0] = s.width;
    buf[base + 1] = s.height;
    buf[base + 2] = s.radius;
    buf[base + 3] = flags[i] ?? 0;
  }
  return buf;
};

const packSpawns = (spawns: Spawn[]): Float32Array => {
  const stride = SPAWN_BYTES / 4; // 24 floats per spawn
  const buf = new Float32Array(stride * spawns.length);
  for (let i = 0; i < spawns.length; i++) {
    const s = spawns[i]!;
    const base = i * stride;
    // pos0 + _pad
    buf[base + 0] = s.pos0[0];
    buf[base + 1] = s.pos0[1];
    buf[base + 2] = s.pos0[2];
    // vel0 + _pad
    buf[base + 4] = s.vel0[0];
    buf[base + 5] = s.vel0[1];
    buf[base + 6] = s.vel0[2];
    // quat0
    buf[base + 8] = s.quat0[0];
    buf[base + 9] = s.quat0[1];
    buf[base + 10] = s.quat0[2];
    buf[base + 11] = s.quat0[3];
    // omega0 + _pad
    buf[base + 12] = s.omega0[0];
    buf[base + 13] = s.omega0[1];
    buf[base + 14] = s.omega0[2];
    // drag
    buf[base + 16] = s.drag[0];
    buf[base + 17] = s.drag[1];
    buf[base + 18] = s.drag[2];
    buf[base + 19] = s.drag[3];
    // meta
    buf[base + 20] = s.meta[0];
    buf[base + 21] = s.meta[1];
    buf[base + 22] = s.meta[2];
    buf[base + 23] = s.meta[3];
  }
  return buf;
};

const packInitialRuntime = (
  spawns: Spawn[],
  cycleDuration: number
): Float32Array => {
  const stride = RUNTIME_BYTES / 4; // 16 floats per particle
  const buf = new Float32Array(stride * spawns.length);
  for (let i = 0; i < spawns.length; i++) {
    const s = spawns[i]!;
    const base = i * stride;
    // pos + life  (life starts at -phaseOffset * cycleDuration for stagger)
    buf[base + 0] = s.pos0[0];
    buf[base + 1] = s.pos0[1];
    buf[base + 2] = s.pos0[2];
    buf[base + 3] = -(s.meta[3] ?? 0) * cycleDuration;
    // vel + _pad
    buf[base + 4] = s.vel0[0];
    buf[base + 5] = s.vel0[1];
    buf[base + 6] = s.vel0[2];
    // quat
    buf[base + 8] = s.quat0[0];
    buf[base + 9] = s.quat0[1];
    buf[base + 10] = s.quat0[2];
    buf[base + 11] = s.quat0[3];
    // omega + _pad
    buf[base + 12] = s.omega0[0];
    buf[base + 13] = s.omega0[1];
    buf[base + 14] = s.omega0[2];
  }
  return buf;
};

const packPalette = (colors: string[]): Float32Array => {
  const buf = new Float32Array(4 * colors.length);
  for (let i = 0; i < colors.length; i++) {
    const [r, g, b, a] = HEX_TO_RGBA(colors[i]!);
    buf[i * 4 + 0] = r;
    buf[i * 4 + 1] = g;
    buf[i * 4 + 2] = b;
    buf[i * 4 + 3] = a;
  }
  return buf;
};

const rasterizeFlakeTextures = async (
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

export const createConfettiResources = async ({
  device,
  count,
  sizeVariations,
  allColors,
  spawns,
  cycleDuration,
}: ConfettiResourcesInput): Promise<ConfettiResources> => {
  const maxFlakeWidth = Math.max(...sizeVariations.map((s) => s.width));
  const maxFlakeHeight = Math.max(...sizeVariations.map((s) => s.height));

  const sizeFlags = computeSizeFlags(sizeVariations);

  // 1) Spawn buffer.
  const spawnsF32 = packSpawns(spawns);
  const spawnsBuffer = device.createBuffer({
    size: spawnsF32.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(
    spawnsBuffer,
    0,
    spawnsF32.buffer as ArrayBuffer,
    spawnsF32.byteOffset,
    spawnsF32.byteLength
  );

  // 2) Runtime buffer (initialized = spawn state, life staggered by phase).
  const runtimeInitial = packInitialRuntime(spawns, cycleDuration);
  const runtimeBuffer = device.createBuffer({
    size: runtimeInitial.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(
    runtimeBuffer,
    0,
    runtimeInitial.buffer as ArrayBuffer,
    runtimeInitial.byteOffset,
    runtimeInitial.byteLength
  );

  // 3) Sizes metadata.
  const sizesF32 = packSizes(sizeVariations, sizeFlags);
  const sizesBuffer = device.createBuffer({
    size: sizesF32.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(
    sizesBuffer,
    0,
    sizesF32.buffer as ArrayBuffer,
    sizesF32.byteOffset,
    sizesF32.byteLength
  );

  // 4) Palette buffer.
  const paletteF32 = packPalette(allColors);
  const paletteBuffer = device.createBuffer({
    size: paletteF32.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(
    paletteBuffer,
    0,
    paletteF32.buffer as ArrayBuffer,
    paletteF32.byteOffset,
    paletteF32.byteLength
  );

  // 5) Texture array for textured flakes.
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

  // 6) Atomic alive-counter + mappable readback buffer.
  const aliveBuffer = device.createBuffer({
    size: 4,
    usage:
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
  });
  const aliveReadback = device.createBuffer({
    size: 4,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  return {
    device,
    spawnsBuffer,
    runtimeBuffer,
    runtimeInitial,
    sizesBuffer,
    paletteBuffer,
    texturesArray,
    sampler,
    aliveBuffer,
    aliveReadback,
    count,
    cycleDuration,
    maxFlakeWidth,
    maxFlakeHeight,
  };
};

export const updateConfettiRuntimeResources = (
  resources: ConfettiResources,
  spawns: Spawn[],
  cycleDuration: number
): boolean => {
  if (spawns.length !== resources.count) {
    return false;
  }

  const spawnsF32 = packSpawns(spawns);
  resources.device.queue.writeBuffer(
    resources.spawnsBuffer,
    0,
    spawnsF32.buffer as ArrayBuffer,
    spawnsF32.byteOffset,
    spawnsF32.byteLength
  );

  const runtimeInitial = packInitialRuntime(spawns, cycleDuration);
  resources.device.queue.writeBuffer(
    resources.runtimeBuffer,
    0,
    runtimeInitial.buffer as ArrayBuffer,
    runtimeInitial.byteOffset,
    runtimeInitial.byteLength
  );

  resources.runtimeInitial = runtimeInitial;
  resources.cycleDuration = cycleDuration;
  return true;
};

export const destroyConfettiResources = (r: ConfettiResources) => {
  r.spawnsBuffer.destroy();
  r.runtimeBuffer.destroy();
  r.sizesBuffer.destroy();
  r.paletteBuffer.destroy();
  r.texturesArray.destroy();
  r.aliveBuffer.destroy();
  r.aliveReadback.destroy();
};
