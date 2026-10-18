import { getSizeVariationsSignature } from '../../hooks/useConfettiFlakes';
import {
  acquireIdleGPUResources,
  releaseIdleGPUResources,
} from '../resourcePool';
import type { ColorRange, SizeVariation } from '../../hooks/useConfettiFlakes';
import {
  canUseTextureOnlyPipeline,
  computeSizeFlags,
  toInitSizeInputs,
  toSizeInputs,
} from '../resourcePacking';
import {
  BUFFER_USAGE,
  confettiLayouts,
  confettiProgram,
} from '../compiledShaders';
import { createBindGroup, createGPUBuffer, packArray } from '../gpuProgram';
import { destroyGPUResourceSet } from '../resourceCleanup';
import {
  createFlakeTexturesArray,
  createShapeMasksArray,
  getLinearClampSampler,
  prepareFlakeTexturesArray,
  prepareShapeMasksArray,
} from '../textureResources';
import { toPaletteInputs } from './palette';
import { withExclusiveGPUAccess } from '../gpuRuntimeOwnership';

export type ConfettiResourceConfig = {
  device: GPUDevice;
  count: number;
  sizeVariations: SizeVariation[];
  allColors: string[];
  colorOverrides: (ColorRange | null)[];
  parentColorCount: number;
};

const allocateConfettiResources = async (
  config: ConfettiResourceConfig,
  isCancelled?: () => boolean
) => {
  const {
    device,
    count,
    sizeVariations,
    allColors,
    colorOverrides,
    parentColorCount,
  } = config;
  const maxFlakeWidth = Math.max(...sizeVariations.map((s) => s.width));
  const maxFlakeHeight = Math.max(...sizeVariations.map((s) => s.height));
  const sizeFlags = computeSizeFlags(sizeVariations);
  const preparedTextures = prepareFlakeTexturesArray(sizeVariations, sizeFlags);
  const preparedMasks = prepareShapeMasksArray(sizeVariations, sizeFlags);
  if (isCancelled?.()) throw new Error('GPU resource creation cancelled');

  // Complete all fallible CPU rasterization before allocating GPU resources.
  // The transaction below owns every allocation until the complete resource
  // set is returned, so a failed upload cannot leak a partial atlas.
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
      const uniforms = buffer(
        BUFFER_USAGE.uniform,
        confettiLayouts.uniforms.size
      );
      const initUniforms = buffer(
        BUFFER_USAGE.uniform,
        confettiLayouts.initUniforms.size
      );
      const spawnsBuffer = buffer(
        BUFFER_USAGE.storage,
        confettiLayouts.spawns.stride * count
      );
      const runtimeBuffer = buffer(
        BUFFER_USAGE.storage,
        confettiLayouts.runtime.stride * count
      );
      const sizesBuffer = buffer(
        BUFFER_USAGE.storage,
        confettiLayouts.sizes.stride * sizeVariations.length,
        packArray(
          confettiLayouts.sizes,
          toSizeInputs(sizeVariations, sizeFlags)
        )
      );
      const initSizesBuffer = buffer(
        BUFFER_USAGE.storage,
        confettiLayouts.initSizes.stride * sizeVariations.length,
        packArray(
          confettiLayouts.initSizes,
          toInitSizeInputs(
            sizeVariations,
            sizeFlags,
            colorOverrides,
            parentColorCount
          )
        )
      );
      const paletteColors = toPaletteInputs(allColors);
      const paletteBuffer = buffer(
        BUFFER_USAGE.storage,
        confettiLayouts.palette.stride * paletteColors.length,
        packArray(confettiLayouts.palette, paletteColors)
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
        confettiProgram,
        'initLayout',
        {
          uniforms: initUniforms,
          spawns: spawnsBuffer,
          runtime: runtimeBuffer,
          sizes: initSizesBuffer,
        }
      );
      const computeBindGroup = createBindGroup(
        device,
        confettiProgram,
        'computeLayout',
        {
          uniforms,
          spawns: spawnsBuffer,
          runtime: runtimeBuffer,
          sizes: sizesBuffer,
        }
      );
      const renderBindGroup = createBindGroup(
        device,
        confettiProgram,
        'renderLayout',
        {
          uniforms,
          spawns: spawnsBuffer,
          runtime: runtimeBuffer,
          sizes: sizesBuffer,
          palette: paletteBuffer,
          sampler,
          textures: texturesArray.createView({ dimension: '2d-array' }),
          shapeMasks: shapeMasksArray.createView({ dimension: '2d-array' }),
        }
      );

      return {
        config,
        device,
        queue,
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

export type ConfettiResources = Awaited<
  ReturnType<typeof allocateConfettiResources>
>;

export const destroyConfettiResources = (
  resources: Omit<ConfettiResources, 'config'>
) => {
  return withExclusiveGPUAccess(() => {
    destroyGPUResourceSet({
      buffers: [
        resources.uniforms,
        resources.initUniforms,
        resources.spawnsBuffer,
        resources.runtimeBuffer,
        resources.sizesBuffer,
        resources.initSizesBuffer,
        resources.paletteBuffer,
      ],
      textures: [resources.texturesArray, resources.shapeMasksArray],
    });
  });
};

const resourceKey = (config: ConfettiResourceConfig) =>
  JSON.stringify([
    'Confetti',
    config.count,
    getSizeVariationsSignature(config.sizeVariations),
    config.allColors,
    config.colorOverrides,
    config.parentColorCount,
  ]);

export const createConfettiResources = async (
  config: ConfettiResourceConfig,
  isCancelled?: () => boolean
): Promise<ConfettiResources> => {
  if (isCancelled?.()) throw new Error('GPU resource creation cancelled');
  const cached = acquireIdleGPUResources<Omit<ConfettiResources, 'config'>>(
    config.device,
    resourceKey(config)
  );
  return cached
    ? { ...cached, config }
    : allocateConfettiResources(config, isCancelled);
};

export const recycleConfettiResources = (resources: ConfettiResources) => {
  const buffers = [
    resources.uniforms,
    resources.initUniforms,
    resources.spawnsBuffer,
    resources.runtimeBuffer,
    resources.sizesBuffer,
    resources.initSizesBuffer,
    resources.paletteBuffer,
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
        void destroyConfettiResources(gpuResources);
      }
    )
  )
    return Promise.resolve();
  return destroyConfettiResources(resources);
};
