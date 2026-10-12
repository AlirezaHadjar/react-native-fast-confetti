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
import {
  BurstInitSizeArraySchema,
  BurstInitUniformsSchema,
  BurstOriginArraySchema,
  BurstOpacityKeyframeArraySchema,
  BurstPaletteArraySchema,
  BurstParticleArraySchema,
  BurstRuntimeArraySchema,
  BurstSizeArraySchema,
  BurstTransformArraySchema,
  BurstUniformsSchema,
  burstInitLayout,
  burstRenderLayout,
  burstTransformLayout,
} from '../shaders/burstConfetti';
import { destroyGPUResourceSet } from '../resourceCleanup';
import {
  createFlakeTexturesArray,
  createShapeMasksArray,
  getLinearClampSampler,
  prepareFlakeTexturesArray,
  prepareShapeMasksArray,
} from '../textureResources';
import { getSharedTypeGPURoot } from '../sharedTypeGPURoot';
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
    const root = getSharedTypeGPURoot(device);
    const queue = device.queue;
    const rawBuffers: { destroy: () => void }[] = [];
    const rawTextures: GPUTexture[] = [];
    try {
      const uniforms = root.createUniform(BurstUniformsSchema);
      rawBuffers.push(uniforms.buffer);
      const initUniforms = root.createUniform(BurstInitUniformsSchema);
      rawBuffers.push(initUniforms.buffer);
      const particlesBuffer = root.createMutable(
        BurstParticleArraySchema(count)
      );
      rawBuffers.push(particlesBuffer.buffer);
      if (presetParticles) particlesBuffer.write(presetParticles);
      const runtimeBuffer = root.createMutable(BurstRuntimeArraySchema(count));
      rawBuffers.push(runtimeBuffer.buffer);
      const transformsBuffer = root.createMutable(
        BurstTransformArraySchema(count)
      );
      rawBuffers.push(transformsBuffer.buffer);
      const originsBuffer = root.createReadonly(
        BurstOriginArraySchema(originCount)
      );
      rawBuffers.push(originsBuffer.buffer);
      const initSizesBuffer = root.createReadonly(
        BurstInitSizeArraySchema(sizeVariations.length),
        toInitSizeInputs(
          sizeVariations,
          sizeFlags,
          colorOverrides,
          parentColorCount
        )
      );
      rawBuffers.push(initSizesBuffer.buffer);
      const sizesBuffer = root.createReadonly(
        BurstSizeArraySchema(sizeVariations.length),
        toBurstSizeInputs(sizeVariations)
      );
      rawBuffers.push(sizesBuffer.buffer);
      const paletteBuffer = root.createReadonly(
        BurstPaletteArraySchema(Math.max(1, allColors.length)),
        toPaletteInputs(allColors)
      );
      rawBuffers.push(paletteBuffer.buffer);
      const opacityKeyframes = opacityAnimation
        ? opacityAnimation.timestamps.map(
            (timestamp, index) =>
              [timestamp, opacityAnimation.opacities[index]!] as const
          )
        : ([[0, 1]] as const);
      const opacityKeyframesBuffer = root.createReadonly(
        BurstOpacityKeyframeArraySchema(opacityKeyframes.length),
        opacityKeyframes
      );
      rawBuffers.push(opacityKeyframesBuffer.buffer);
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

      const initBindGroup = root.createBindGroup(burstInitLayout, {
        uniforms: initUniforms.buffer,
        particles: particlesBuffer.buffer,
        runtime: runtimeBuffer.buffer,
        origins: originsBuffer.buffer,
        sizes: initSizesBuffer.buffer,
      });

      const renderBindGroup = root.createBindGroup(burstRenderLayout, {
        uniforms: uniforms.buffer,
        transforms: transformsBuffer.buffer,
        palette: paletteBuffer.buffer,
        sampler,
        textures: texturesArray.createView({ dimension: '2d-array' }),
        shapeMasks: shapeMasksArray.createView({ dimension: '2d-array' }),
      });
      const transformBindGroup = root.createBindGroup(burstTransformLayout, {
        uniforms: uniforms.buffer,
        particles: particlesBuffer.buffer,
        runtime: runtimeBuffer.buffer,
        transforms: transformsBuffer.buffer,
        sizes: sizesBuffer.buffer,
        opacityKeyframes: opacityKeyframesBuffer.buffer,
      });

      return {
        config,
        root,
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
        resources.uniforms.buffer,
        resources.initUniforms.buffer,
        resources.particlesBuffer.buffer,
        resources.runtimeBuffer.buffer,
        resources.transformsBuffer.buffer,
        resources.originsBuffer.buffer,
        resources.initSizesBuffer.buffer,
        resources.sizesBuffer.buffer,
        resources.paletteBuffer.buffer,
        resources.opacityKeyframesBuffer.buffer,
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
    if (config.presetParticles)
      cached.particlesBuffer.write(config.presetParticles);
    return { ...cached, config };
  }
  return allocateBurstConfettiResources(config, isCancelled);
};

export const recycleBurstConfettiResources = (
  resources: BurstConfettiResources
) => {
  const buffers = [
    resources.uniforms.buffer.buffer,
    resources.initUniforms.buffer.buffer,
    resources.particlesBuffer.buffer.buffer,
    resources.runtimeBuffer.buffer.buffer,
    resources.transformsBuffer.buffer.buffer,
    resources.originsBuffer.buffer.buffer,
    resources.initSizesBuffer.buffer.buffer,
    resources.sizesBuffer.buffer.buffer,
    resources.paletteBuffer.buffer.buffer,
    resources.opacityKeyframesBuffer.buffer.buffer,
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
