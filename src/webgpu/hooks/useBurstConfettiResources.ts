import { tgpu } from 'typegpu';

import type { SizeVariation } from '../../hooks/useConfettiFlakes';
import {
  rasterizeFlakeTextures,
  toPaletteInputs,
} from './useConfettiResources';
import type { BurstParticle } from '../burstResourcePacking';
import { toBurstSizeInputs } from '../burstResourcePacking';
import {
  BurstPaletteArraySchema,
  BurstParticleArraySchema,
  BurstSizeArraySchema,
  BurstUniformsSchema,
  burstRenderLayout,
} from '../shaders/burstConfetti';

export type BurstConfettiResourcesInput = {
  device: GPUDevice;
  particles: BurstParticle[];
  sizeVariations: SizeVariation[];
  allColors: string[];
};

const toBurstParticleInputs = (particles: BurstParticle[]) =>
  particles.map((particle) => ({
    originAndTiming: particle.originAndTiming,
    velocityAndDepth: particle.velocityAndDepth,
    rotationAndMeta: particle.rotationAndMeta,
    indices: particle.indices,
  }));

const createBurstConfettiResourcesImpl = async ({
  device,
  particles,
  sizeVariations,
  allColors,
}: BurstConfettiResourcesInput) => {
  const root = tgpu.initFromDevice({ device, unstable_names: 'strict' });
  const maxFlakeWidth = Math.max(...sizeVariations.map((s) => s.width));
  const maxFlakeHeight = Math.max(...sizeVariations.map((s) => s.height));

  const uniforms = root.createUniform(BurstUniformsSchema);
  const particlesBuffer = root.createReadonly(
    BurstParticleArraySchema(particles.length),
    toBurstParticleInputs(particles)
  );
  const sizesBuffer = root.createReadonly(
    BurstSizeArraySchema(sizeVariations.length),
    toBurstSizeInputs(sizeVariations)
  );
  const paletteBuffer = root.createReadonly(
    BurstPaletteArraySchema(Math.max(1, allColors.length)),
    toPaletteInputs(allColors)
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

  const renderBindGroup = root.createBindGroup(burstRenderLayout, {
    uniforms: uniforms.buffer,
    particles: particlesBuffer.buffer,
    sizes: sizesBuffer.buffer,
    palette: paletteBuffer.buffer,
    sampler,
    textures: texturesArray.createView({ dimension: '2d-array' }),
  });

  return {
    root,
    device,
    uniforms,
    particlesBuffer,
    sizesBuffer,
    paletteBuffer,
    renderBindGroup,
    texturesArray,
    sampler,
    count: particles.length,
  };
};

export type BurstConfettiResources = Awaited<
  ReturnType<typeof createBurstConfettiResourcesImpl>
>;

export const createBurstConfettiResources = createBurstConfettiResourcesImpl;

export const updateBurstConfettiParticles = (
  resources: BurstConfettiResources,
  particles: BurstParticle[]
): boolean => {
  if (particles.length !== resources.count) {
    return false;
  }

  resources.particlesBuffer.write(toBurstParticleInputs(particles));
  return true;
};

export const destroyBurstConfettiResources = (
  resources: BurstConfettiResources
) => {
  resources.root.destroy();
  resources.texturesArray.destroy();
};
