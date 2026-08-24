import type { ColorRange, SizeVariation } from '../../hooks/useConfettiFlakes';
import { toPaletteInputs } from './palette';
import { toBurstSizeInputs } from '../burstResourcePacking';
import {
  canUseTextureOnlyPipeline,
  computeSizeFlags,
  toInitSizeInputs,
} from '../resourcePacking';
import {
  BurstInitSizeArraySchema,
  BurstInitUniformsSchema,
  BurstOriginArraySchema,
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

export type BurstConfettiResourceConfig = {
  device: GPUDevice;
  count: number;
  originCount: number;
  sizeVariations: SizeVariation[];
  allColors: string[];
  colorOverrides: (ColorRange | null)[];
  parentColorCount: number;
};

export const createBurstConfettiResources = async (
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
  } = config;
  const maxFlakeWidth = Math.max(...sizeVariations.map((s) => s.width));
  const maxFlakeHeight = Math.max(...sizeVariations.map((s) => s.height));
  const sizeFlags = computeSizeFlags(sizeVariations);
  const preparedTextures = prepareFlakeTexturesArray(sizeVariations, sizeFlags);
  const preparedMasks = prepareShapeMasksArray(sizeVariations, sizeFlags);
  if (isCancelled?.()) throw new Error('GPU resource creation cancelled');

  const root = getSharedTypeGPURoot(device);
  const queue = device.queue;
  const rawTextures: GPUTexture[] = [];
  try {
    const uniforms = root.createUniform(BurstUniformsSchema);
    const initUniforms = root.createUniform(BurstInitUniformsSchema);
    const particlesBuffer = root.createMutable(BurstParticleArraySchema(count));
    const runtimeBuffer = root.createMutable(BurstRuntimeArraySchema(count));
    const transformsBuffer = root.createMutable(
      BurstTransformArraySchema(count)
    );
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
    const shapeMasksArray = createShapeMasksArray(device, queue, preparedMasks);
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
    destroyGPUResourceSet({ buffers: [], textures: rawTextures });
    throw error;
  }
};

export type BurstConfettiResources = Awaited<
  ReturnType<typeof createBurstConfettiResources>
>;

export const destroyBurstConfettiResources = (
  resources: BurstConfettiResources
) => {
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
    ],
    textures: [resources.texturesArray, resources.shapeMasksArray],
  });
};
