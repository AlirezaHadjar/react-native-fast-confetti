import type { SizeVariation } from '../hooks/useConfettiFlakes';
import type { Spawn } from './utils';

export const computeSizeFlags = (sizes: SizeVariation[]): number[] => {
  const flags: number[] = [];
  let textureLayer = 0;
  for (const size of sizes) {
    let flag = 0;
    if (size.flakeStyle === 'glossy') flag |= 1;
    if (size.texture) {
      flag |= 2;
      flag |= (textureLayer & 0xffff) << 16;
      textureLayer++;
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
    vel: spawn.vel0,
    quat: spawn.quat0,
    omega: spawn.omega0,
  }));
