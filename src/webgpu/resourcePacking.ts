import type { ColorRange, SizeVariation } from '../hooks/useConfettiFlakes';

export const SIZE_FLAG_GLOSSY = 1 << 0;
export const SIZE_FLAG_TEXTURED = 1 << 1;
export const SIZE_FLAG_SHAPE_MASK = 1 << 2;
export const SIZE_FLAG_TEXTURE_LAYER_SHIFT = 8;
export const SIZE_FLAG_MASK_LAYER_SHIFT = 16;
export const SIZE_FLAG_LAYER_MASK = 0xff;

export const canUseTextureOnlyPipeline = (sizes: SizeVariation[]) =>
  sizes.length > 0 &&
  sizes.every((size) => size.texture !== undefined && size.radius <= 0);

export const computeSizeFlags = (sizes: SizeVariation[]): number[] => {
  const flags: number[] = [];
  const textureLayers = new Map<object, number>();
  const maskLayers = new Map<string, number>();
  let textureLayer = 0;
  let maskLayer = 0;
  for (let index = 0; index < sizes.length; index++) {
    const size = sizes[index]!;
    let flag = 0;
    if (size.flakeStyle === 'glossy') flag |= SIZE_FLAG_GLOSSY;
    if (size.texture) {
      const textureKey = size.texture.content as object;
      let layer = textureLayers.get(textureKey);
      if (layer === undefined) {
        layer = textureLayer++;
        if (layer > SIZE_FLAG_LAYER_MASK) {
          throw new Error('WebGPU supports at most 256 unique flake textures');
        }
        textureLayers.set(textureKey, layer);
      }
      flag |= SIZE_FLAG_TEXTURED;
      flag |= (layer & SIZE_FLAG_LAYER_MASK) << SIZE_FLAG_TEXTURE_LAYER_SHIFT;
    }
    if (size.radius > 0) {
      const maskKey = `${size.width}:${size.height}:${size.radius}`;
      let layer = maskLayers.get(maskKey);
      if (layer === undefined) {
        layer = maskLayer++;
        if (layer > SIZE_FLAG_LAYER_MASK) {
          throw new Error('WebGPU supports at most 256 unique flake masks');
        }
        maskLayers.set(maskKey, layer);
      }
      flag |= SIZE_FLAG_SHAPE_MASK;
      flag |= (layer & SIZE_FLAG_LAYER_MASK) << SIZE_FLAG_MASK_LAYER_SHIFT;
    }
    flags.push(flag);
  }
  return flags;
};

export const toSizeInputs = (sizes: SizeVariation[], flags: number[]) =>
  sizes.map((size, index) => ({
    dims: [size.width, size.height, size.radius, flags[index] ?? 0] as const,
  }));

export const toInitSizeInputs = (
  sizes: SizeVariation[],
  flags: number[],
  colorOverrides: (ColorRange | null)[],
  parentColorCount: number
) =>
  sizes.map((size, index) => {
    const range = colorOverrides[index];
    return {
      selection: [
        range?.start ?? 0,
        Math.max(1, range?.count ?? parentColorCount),
        flags[index] ?? 0,
        0,
      ] as const,
      dims: [size.width, size.height, size.radius, 0] as const,
    };
  });

const greatestCommonDivisor = (left: number, right: number) => {
  let a = Math.abs(Math.trunc(left));
  let b = Math.abs(Math.trunc(right));
  while (b !== 0) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a;
};

/**
 * Creates a cheap bijection over particle indices. The init shader uses it to
 * preserve one continuous-confetti phase in every stratum without uploading
 * a count-sized shuffled phase array from JavaScript.
 */
export const createPhasePermutation = (count: number, seed: number) => {
  const normalizedCount = Math.max(1, Math.trunc(count));
  const mixedSeed = Math.imul((seed >>> 0) ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  let stride = (mixedSeed % 251) | 1;
  while (greatestCommonDivisor(stride, normalizedCount) !== 1) {
    stride += 2;
  }
  const offset =
    (Math.imul((seed + 1) >>> 0, 0xc2b2ae35) >>> 0) % normalizedCount;
  return { stride, offset };
};
