import type { SizeVariation } from '../hooks/useConfettiFlakes';
import type { Spawn } from './utils';

export const SIZE_FLAG_GLOSSY = 1 << 0;
export const SIZE_FLAG_TEXTURED = 1 << 1;
export const SIZE_FLAG_SHAPE_MASK = 1 << 2;
export const SIZE_FLAG_TEXTURE_LAYER_SHIFT = 8;
export const SIZE_FLAG_MASK_LAYER_SHIFT = 16;
export const SIZE_FLAG_LAYER_MASK = 0xff;

export const computeSizeFlags = (sizes: SizeVariation[]): number[] => {
  const flags: number[] = [];
  let textureLayer = 0;
  for (let index = 0; index < sizes.length; index++) {
    const size = sizes[index]!;
    let flag = 0;
    if (size.flakeStyle === 'glossy') flag |= SIZE_FLAG_GLOSSY;
    if (size.texture) {
      flag |= SIZE_FLAG_TEXTURED;
      flag |=
        (textureLayer & SIZE_FLAG_LAYER_MASK) << SIZE_FLAG_TEXTURE_LAYER_SHIFT;
      textureLayer++;
    }
    if (size.radius > 0) {
      flag |= SIZE_FLAG_SHAPE_MASK;
      flag |= (index & SIZE_FLAG_LAYER_MASK) << SIZE_FLAG_MASK_LAYER_SHIFT;
    }
    flags.push(flag);
  }
  return flags;
};

export const toSizeInputs = (
  sizes: SizeVariation[],
  flags: number[]
) =>
  sizes.map((size, index) => ({
    dims: [size.width, size.height, size.radius, flags[index] ?? 0] as const,
  }));

export const toSpawnInputs = (spawns: Spawn[]) =>
  spawns.map((spawn) => ({
    pos0: spawn.pos0,
    vel0: spawn.vel0,
    quat0: spawn.quat0,
    omega0: spawn.omega0,
    drag: spawn.drag,
    info: spawn.meta,
  }));

export const toRuntimeInputs = (
  spawns: Spawn[],
  cycleDuration: number
) =>
  spawns.map((spawn) => ({
    pos: spawn.pos0,
    life: -(spawn.meta[3] ?? 0) * cycleDuration,
    prevPos: spawn.pos0,
    prevLife: -(spawn.meta[3] ?? 0) * cycleDuration,
    vel: spawn.vel0,
    quat: spawn.quat0,
    prevQuat: spawn.quat0,
    omega: spawn.omega0,
  }));
