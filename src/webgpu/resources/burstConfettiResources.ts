import { getSizeVariationsSignature } from '../../hooks/useConfettiFlakes';
import {
  acquireIdleGPUResources,
  releaseIdleGPUResources,
} from '../resourcePool';
import type { ColorRange, SizeVariation } from '../../hooks/useConfettiFlakes';
import type { ResolvedOpacityAnimation } from '../../fadeOut';
import { toPaletteInputs } from './palette';
import { toBurstSizeInputs, type BurstParticle } from '../burstResourcePacking';
import {
  canUseTextureOnlyPipeline,
  computeSizeFlags,
  toInitSizeInputs,
} from '../resourcePacking';
import { BUFFER_USAGE, burstLayouts, burstProgram } from '../compiledShaders';
import { createBindGroup, createGPUBuffer, packArray } from '../gpuProgram';
import { destroyGPUResourceSet } from '../resourceCleanup';
import {
  createFlakeTexturesArray,
  createShapeMasksArray,
  getLinearClampSampler,
  prepareFlakeTexturesArray,
  prepareShapeMasksArray,
} from '../textureResources';
import { withExclusiveGPUAccess } from '../gpuRuntimeOwnership';

export type BurstConfettiResourceConfig = {
  device: GPUDevice;
  count: number;
  originCount: number;
  sizeVariations: SizeVariation[];
  allColors: string[];
  colorOverrides: (ColorRange | null)[];
  parentColorCount: number;
  opacityAnimation: ResolvedOpacityAnimation | null;
  presetParticles: BurstParticle[] | null;
};

const allocateBurstConfettiResources = async (
  config: BurstConfettiResourceConfig,
  isCancelled?: () => boolean
) => {
  const {
    device,
    count,
    originCount,
    sizeVariations,
    allColors,
    colorOverrides,
    parentColorCount,
    opacityAnimation,
    presetParticles,
  } = config;
  const maxFlakeWidth = Math.max(...sizeVariations.map((s) => s.width));
  const maxFlakeHeight = Math.max(...sizeVariations.map((s) => s.height));
  const sizeFlags = computeSizeFlags(sizeVariations);
  const preparedTextures = prepareFlakeTexturesArray(sizeVariations, sizeFlags);
  const preparedMasks = prepareShapeMasksArray(sizeVariations, sizeFlags);
  if (isCancelled?.()) throw new Error('GPU resource creation cancelled');

  return withExclusiveGPUAccess(() => {
    const queue = device.queue;
    const rawBuffers: GPUBuffer[] = [];
    const rawTextures: GPUTexture[] = [];
    const buffer = (usage: number, size: number, data?: ArrayBuffer) => {
      const created = createGPUBuffer(device, usage, size, data);
      rawBuffers.push(created);
      return created;
    };
    try {
      const uniforms = buffer(BUFFER_USAGE.uniform, burstLayouts.uniforms.size);
      const initUniforms = buffer(
        BUFFER_USAGE.uniform,
        burstLayouts.initUniforms.size
      );
      const particlesBuffer = buffer(
        BUFFER_USAGE.storage,
        burstLayouts.particles.stride * count,
        presetParticles
          ? packArray(burstLayouts.particles, presetParticles, count)
          : undefined
      );
      const runtimeBuffer = buffer(
        BUFFER_USAGE.storage,
        burstLayouts.runtime.stride * count
      );
      const transformsBuffer = buffer(
        BUFFER_USAGE.storage,
        burstLayouts.transforms.stride * count
      );
      const originsBuffer = buffer(
        BUFFER_USAGE.storage,
        burstLayouts.origins.stride * originCount
      );
      const initSizesBuffer = buffer(
        BUFFER_USAGE.storage,
        burstLayouts.initSizes.stride * sizeVariations.length,
        packArray(
          burstLayouts.initSizes,
          toInitSizeInputs(
            sizeVariations,
            sizeFlags,
            colorOverrides,
            parentColorCount
          )
        )
      );
      const sizesBuffer = buffer(
        BUFFER_USAGE.storage,
        burstLayouts.sizes.stride * sizeVariations.length,
        packArray(burstLayouts.sizes, toBurstSizeInputs(sizeVariations))
      );
      const paletteColors = toPaletteInputs(allColors);
      const paletteBuffer = buffer(
        BUFFER_USAGE.storage,
        burstLayouts.palette.stride * paletteColors.length,
        packArray(burstLayouts.palette, paletteColors)
      );
      const opacityKeyframes = opacityAnimation
        ? opacityAnimation.timestamps.map(
            (timestamp, index) =>
              [timestamp, opacityAnimation.opacities[index]!] as const
          )
        : ([[0, 1]] as const);
      const opacityKeyframesBuffer = buffer(
        BUFFER_USAGE.storage,
        burstLayouts.opacityKeyframes.stride * opacityKeyframes.length,
        packArray(burstLayouts.opacityKeyframes, opacityKeyframes)
      );
      const shapeMasksArray = createShapeMasksArray(
        device,
        queue,
        preparedMasks
      );
      rawTextures.push(shapeMasksArray);
      const texturesArray = createFlakeTexturesArray(
        device,
        queue,
        preparedTextures
      );
      rawTextures.push(texturesArray);
      const sampler = getLinearClampSampler(device);

      const initBindGroup = createBindGroup(
        device,
        burstProgram,
        'burstInitLayout',
        {
          uniforms: initUniforms,
          particles: particlesBuffer,
          runtime: runtimeBuffer,
          origins: originsBuffer,
          sizes: initSizesBuffer,
        }
      );
      const renderBindGroup = createBindGroup(
        device,
        burstProgram,
        'burstRenderLayout',
        {
          uniforms,
          transforms: transformsBuffer,
          palette: paletteBuffer,
          sampler,
          textures: texturesArray.createView({ dimension: '2d-array' }),
          shapeMasks: shapeMasksArray.createView({ dimension: '2d-array' }),
        }
      );
      const transformBindGroup = createBindGroup(
        device,
        burstProgram,
        'burstTransformLayout',
        {
          uniforms,
          particles: particlesBuffer,
          runtime: runtimeBuffer,
          transforms: transformsBuffer,
          sizes: sizesBuffer,
          opacityKeyframes: opacityKeyframesBuffer,
        }
      );

      return {
        config,
        device,
        queue,
        uniforms,
        initUniforms,
        particlesBuffer,
        runtimeBuffer,
        transformsBuffer,
        originsBuffer,
        initSizesBuffer,
        sizesBuffer,
        paletteBuffer,
        opacityKeyframesBuffer,
        initBindGroup,
        transformBindGroup,
        renderBindGroup,
        texturesArray,
        shapeMasksArray,
        sampler,
        maxFlakeWidth,
        maxFlakeHeight,
        canUseTextureOnlyPipeline: canUseTextureOnlyPipeline(sizeVariations),
      };
    } catch (error) {
      destroyGPUResourceSet({ buffers: rawBuffers, textures: rawTextures });
      throw error;
    }
  });
};

export type BurstConfettiResources = Awaited<
  ReturnType<typeof allocateBurstConfettiResources>
>;

export const destroyBurstConfettiResources = (
  resources: Omit<BurstConfettiResources, 'config'>
) => {
  return withExclusiveGPUAccess(() => {
    destroyGPUResourceSet({
      buffers: [
        resources.uniforms,
        resources.initUniforms,
        resources.particlesBuffer,
        resources.runtimeBuffer,
        resources.transformsBuffer,
        resources.originsBuffer,
        resources.initSizesBuffer,
        resources.sizesBuffer,
        resources.paletteBuffer,
        resources.opacityKeyframesBuffer,
      ],
      textures: [resources.texturesArray, resources.shapeMasksArray],
    });
  });
};

const resourceKey = (config: BurstConfettiResourceConfig) =>
  JSON.stringify([
    'BurstConfetti',
    config.count,
    getSizeVariationsSignature(config.sizeVariations),
    config.allColors,
    config.colorOverrides,
    config.parentColorCount,
    config.originCount,
    config.opacityAnimation,
    config.presetParticles !== null,
  ]);

export const createBurstConfettiResources = async (
  config: BurstConfettiResourceConfig,
  isCancelled?: () => boolean
): Promise<BurstConfettiResources> => {
  if (isCancelled?.()) throw new Error('GPU resource creation cancelled');
  const cached = acquireIdleGPUResources<
    Omit<BurstConfettiResources, 'config'>
  >(config.device, resourceKey(config));
  if (cached) {
    if (config.presetParticles) {
      cached.queue.writeBuffer(
        cached.particlesBuffer,
        0,
        packArray(burstLayouts.particles, config.presetParticles, config.count)
      );
    }
    return { ...cached, config };
  }
  return allocateBurstConfettiResources(config, isCancelled);
};

export const recycleBurstConfettiResources = (
  resources: BurstConfettiResources
) => {
  const buffers = [
    resources.uniforms,
    resources.initUniforms,
    resources.particlesBuffer,
    resources.runtimeBuffer,
    resources.transformsBuffer,
    resources.originsBuffer,
    resources.initSizesBuffer,
    resources.sizesBuffer,
    resources.paletteBuffer,
    resources.opacityKeyframesBuffer,
  ];
  const textures = [resources.texturesArray, resources.shapeMasksArray];
  const { config, ...gpuResources } = resources;
  const bytes =
    buffers.reduce((sum, buffer) => sum + buffer.size, 0) +
    textures.reduce(
      (sum, texture) =>
        sum + texture.width * texture.height * texture.depthOrArrayLayers * 4,
      0
    );
  if (
    releaseIdleGPUResources(
      resources.device,
      resourceKey(config),
      gpuResources,
      bytes,
      () => {
        void destroyBurstConfettiResources(gpuResources);
      }
    )
  )
    return Promise.resolve();
  return destroyBurstConfettiResources(resources);
};
