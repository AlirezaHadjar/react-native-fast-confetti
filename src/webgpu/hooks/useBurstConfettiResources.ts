import { tgpu } from 'typegpu';

import type {
  ColorRange,
  SizeVariation,
} from '../../hooks/useConfettiFlakes';
import {
  createShapeMasksTexture,
  rasterizeFlakeTextures,
  toPaletteInputs,
} from './useConfettiResources';
import { toBurstSizeInputs } from '../burstResourcePacking';
import {
  computeSizeFlags,
  toInitSizeInputs,
} from '../resourcePacking';
import {
  BurstInitSizeArraySchema,
  BurstInitUniformsSchema,
  BurstOriginArraySchema,
  BurstPaletteArraySchema,
  BurstParticleArraySchema,
  BurstSizeArraySchema,
  BurstUniformsSchema,
  burstInitLayout,
  burstRenderLayout,
} from '../shaders/burstConfetti';

export type BurstConfettiResourcesInput = {
  device: GPUDevice;
  count: number;
  originCount: number;
  sizeVariations: SizeVariation[];
  allColors: string[];
  colorOverrides: (ColorRange | null)[];
  parentColorCount: number;
};

const createBurstConfettiResourcesImpl = async ({
  device,
  count,
  originCount,
  sizeVariations,
  allColors,
  colorOverrides,
  parentColorCount,
}: BurstConfettiResourcesInput) => {
  const root = tgpu.initFromDevice({ device, unstable_names: 'strict' });
  const maxFlakeWidth = Math.max(...sizeVariations.map((s) => s.width));
  const maxFlakeHeight = Math.max(...sizeVariations.map((s) => s.height));
  const sizeFlags = computeSizeFlags(sizeVariations);

  const uniforms = root.createUniform(BurstUniformsSchema);
  const initUniforms = root.createUniform(BurstInitUniformsSchema);
  const particlesBuffer = root.createMutable(BurstParticleArraySchema(count));
  const originsBuffer = root.createReadonly(
    BurstOriginArraySchema(originCount)
  );
  const initSizesBuffer = root.createReadonly(
    BurstInitSizeArraySchema(sizeVariations.length),
    toInitSizeInputs(
      sizeVariations,
      sizeFlags,
      colorOverrides,
      parentColorCount
    )
  );
  const sizesBuffer = root.createReadonly(
    BurstSizeArraySchema(sizeVariations.length),
    toBurstSizeInputs(sizeVariations)
  );
  const paletteBuffer = root.createReadonly(
    BurstPaletteArraySchema(Math.max(1, allColors.length)),
    toPaletteInputs(allColors)
  );
  const shapeMasksArray = createShapeMasksTexture(
    device,
    sizeVariations,
    sizeFlags,
    maxFlakeWidth,
    maxFlakeHeight
  );

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

  const initBindGroup = root.createBindGroup(burstInitLayout, {
    uniforms: initUniforms.buffer,
    particles: particlesBuffer.buffer,
    origins: originsBuffer.buffer,
    sizes: initSizesBuffer.buffer,
  });

  const renderBindGroup = root.createBindGroup(burstRenderLayout, {
    uniforms: uniforms.buffer,
    particles: particlesBuffer.buffer,
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
    particlesBuffer,
    originsBuffer,
    initSizesBuffer,
    sizesBuffer,
    paletteBuffer,
    initBindGroup,
    renderBindGroup,
    texturesArray,
    shapeMasksArray,
    sampler,
    count,
    originCount,
    sizeVariations,
    allColors,
    colorOverrides,
    parentColorCount,
  };
};

export type BurstConfettiResources = Awaited<
  ReturnType<typeof createBurstConfettiResourcesImpl>
>;

export const createBurstConfettiResources = createBurstConfettiResourcesImpl;
