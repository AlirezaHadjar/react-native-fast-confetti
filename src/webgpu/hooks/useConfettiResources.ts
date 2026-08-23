import { Skia } from '@shopify/react-native-skia';
import { tgpu } from 'typegpu';

import type { ColorRange, SizeVariation } from '../../hooks/useConfettiFlakes';
import {
  canUseTextureOnlyPipeline,
  computeSizeFlags,
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
import { destroyGPUResourceSet } from '../resourceCleanup';
import {
  createFlakeTexturesArray,
  createShapeMasksArray,
  getLinearClampSampler,
  prepareFlakeTexturesArray,
  prepareShapeMasksArray,
} from '../textureResources';

const HEX_TO_RGBA = (hex: string): FixedLengthArray<number, 4> => {
  const c = Skia.Color(hex);
  return [c[0] ?? 0, c[1] ?? 0, c[2] ?? 0, c[3] ?? 1];
};

export const toPaletteInputs = (colors: string[]) =>
  (colors.length > 0 ? colors : ['#ffffff']).map(HEX_TO_RGBA);

export type ConfettiResourcesInput = {
  device: GPUDevice;
  count: number;
  sizeVariations: SizeVariation[];
  allColors: string[];
  colorOverrides: (ColorRange | null)[];
  parentColorCount: number;
  isCancelled?: () => boolean;
};

const createConfettiResourcesImpl = async ({
  device,
  count,
  sizeVariations,
  allColors,
  colorOverrides,
  parentColorCount,
  isCancelled,
}: ConfettiResourcesInput) => {
  const maxFlakeWidth = Math.max(...sizeVariations.map((s) => s.width));
  const maxFlakeHeight = Math.max(...sizeVariations.map((s) => s.height));
  const sizeFlags = computeSizeFlags(sizeVariations);
  const preparedTextures = prepareFlakeTexturesArray(sizeVariations, sizeFlags);
  const preparedMasks = prepareShapeMasksArray(sizeVariations, sizeFlags);
  if (isCancelled?.()) throw new Error('GPU resource creation cancelled');

  // Complete all fallible CPU rasterization before allocating GPU resources.
  // The transaction below owns every allocation until the complete resource
  // set is returned, so a failed upload cannot leak a partial atlas.
  const root = tgpu.initFromDevice({ device, unstable_names: 'strict' });
  const queue = device.queue;
  const rawTextures: GPUTexture[] = [];
  try {
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
    const shapeMasksArray = createShapeMasksArray(device, queue, preparedMasks);
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
      count,
      sizeVariations,
      allColors,
      colorOverrides,
      parentColorCount,
      maxFlakeWidth,
      maxFlakeHeight,
      canUseTextureOnlyPipeline: canUseTextureOnlyPipeline(sizeVariations),
    };
  } catch (error) {
    destroyGPUResourceSet({ buffers: [], textures: rawTextures, root });
    throw error;
  }
};

export type ConfettiResources = Awaited<
  ReturnType<typeof createConfettiResourcesImpl>
>;

export const destroyConfettiResources = (resources: ConfettiResources) => {
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
    root: resources.root,
  });
};

export const createConfettiResources = createConfettiResourcesImpl;
