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
  InitSizeArraySchema,
  InitUniformsSchema,
  PaletteArraySchema,
  SizeArraySchema,
  UniformsSchema,
  computeLayout,
  initLayout,
  renderLayout,
} from '../shaders/confetti';
import {
  ParticleRuntimeArraySchema,
  ParticleSpawnArraySchema,
} from '../shaders/physics/state';
import { destroyGPUResourceSet } from '../resourceCleanup';
import {
  createFlakeTexturesArray,
  createShapeMasksArray,
  getLinearClampSampler,
  prepareFlakeTexturesArray,
  prepareShapeMasksArray,
} from '../textureResources';
import { toPaletteInputs } from './palette';
import { getSharedTypeGPURoot } from '../sharedTypeGPURoot';
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
    const root = getSharedTypeGPURoot(device);
    const queue = device.queue;
    const rawBuffers: { destroy: () => void }[] = [];
    const rawTextures: GPUTexture[] = [];
    try {
      const uniforms = root.createUniform(UniformsSchema);
      rawBuffers.push(uniforms.buffer);
      const initUniforms = root.createUniform(InitUniformsSchema);
      rawBuffers.push(initUniforms.buffer);
      const spawnsBuffer = root.createMutable(ParticleSpawnArraySchema(count));
      rawBuffers.push(spawnsBuffer.buffer);
      const runtimeBuffer = root.createMutable(
        ParticleRuntimeArraySchema(count)
      );
      rawBuffers.push(runtimeBuffer.buffer);
      const sizesBuffer = root.createReadonly(
        SizeArraySchema(sizeVariations.length),
        toSizeInputs(sizeVariations, sizeFlags)
      );
      rawBuffers.push(sizesBuffer.buffer);
      const initSizesBuffer = root.createReadonly(
        InitSizeArraySchema(sizeVariations.length),
        toInitSizeInputs(
          sizeVariations,
          sizeFlags,
          colorOverrides,
          parentColorCount
        )
      );
      rawBuffers.push(initSizesBuffer.buffer);
      const paletteBuffer = root.createReadonly(
        PaletteArraySchema(Math.max(1, allColors.length)),
        toPaletteInputs(allColors)
      );
      rawBuffers.push(paletteBuffer.buffer);
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
        sizes: sizesBuffer.buffer,
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
        config,
        root,
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
        resources.uniforms.buffer,
        resources.initUniforms.buffer,
        resources.spawnsBuffer.buffer,
        resources.runtimeBuffer.buffer,
        resources.sizesBuffer.buffer,
        resources.initSizesBuffer.buffer,
        resources.paletteBuffer.buffer,
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
    resources.uniforms.buffer.buffer,
    resources.initUniforms.buffer.buffer,
    resources.spawnsBuffer.buffer.buffer,
    resources.runtimeBuffer.buffer.buffer,
    resources.sizesBuffer.buffer.buffer,
    resources.initSizesBuffer.buffer.buffer,
    resources.paletteBuffer.buffer.buffer,
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
