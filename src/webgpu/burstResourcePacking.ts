import type { SizeVariation } from '../hooks/useConfettiFlakes';
import type { CannonParticleSystem, Position } from '../types';
import type { CannonConfig, PIConfig } from '../utils';
import { computeSizeFlags, toSizeInputs } from './resourcePacking';
import {
  DEFAULT_CANNON_CONFETTI_DEPTH,
  DEFAULT_CANNON_CONFETTI_ROTATION,
  DEFAULT_PI_CONFETTI_DEPTH,
  DEFAULT_PI_CONFETTI_ROTATION,
} from '../constants';
import type {
  FixedLengthArray,
  ReadonlyFixedLengthArray,
} from '../typeHelpers';

export type BurstMode = 'pi' | 'cannon';

type Float4 = FixedLengthArray<number, 4>;
type ReadonlyFloat4 = ReadonlyFixedLengthArray<number, 4>;

type BurstBoxBase = {
  vx: number;
  vy: number;
  launchDelay: number;
  depthScale: number;
  clockwise: boolean;
  maxRotation: { x: number; z: number };
  colorIndex: number;
  sizeIndex: number;
  initialRotation: number;
  isTextured: boolean;
};

type PIBox = BurstBoxBase & {
  originIndex: number;
  originDelay: number;
  speedMultiplier: number;
};

type CannonBox = BurstBoxBase & {
  cannonIndex: number;
};

export type BurstParticle = {
  originAndTiming: Float4;
  velocityAndDepth: Float4;
  rotationAndMeta: Float4;
  indices: Float4;
};

export type GPUBurstOrigin = {
  originAndCount: ReadonlyFloat4;
  targetStartAndMode: ReadonlyFloat4;
  motion: ReadonlyFloat4;
  selection: ReadonlyFloat4;
  rotation: ReadonlyFloat4;
  depth: ReadonlyFloat4;
};

export type GPUBurstInitialization = {
  seed: number;
  layoutCount: number;
  containerHeight: number;
  launchDelayMax: number;
  flightDurationSeconds: number;
  origins: GPUBurstOrigin[];
};

const hiddenOrigin: Position = { x: -10000, y: -10000 };

export const toBurstSizeInputs = (sizes: SizeVariation[]) =>
  toSizeInputs(sizes, computeSizeFlags(sizes));

export const toPIBurstParticles = (
  boxes: PIBox[],
  blastPositions: Position[],
  mode: BurstMode = 'pi'
): BurstParticle[] =>
  boxes.map((box) => {
    const origin = blastPositions[box.originIndex] ?? hiddenOrigin;
    return {
      originAndTiming: [origin.x, origin.y, box.originDelay, box.launchDelay],
      velocityAndDepth: [box.vx, box.vy, box.depthScale, box.initialRotation],
      rotationAndMeta: [
        box.maxRotation.x,
        box.maxRotation.z,
        box.clockwise ? 1 : -1,
        mode === 'pi' ? 0 : 1,
      ],
      indices: [
        box.sizeIndex,
        box.colorIndex,
        box.isTextured ? 1 : 0,
        box.speedMultiplier,
      ],
    };
  });

export const toCannonBurstParticles = (
  boxes: CannonBox[],
  cannonPositions: Position[],
  mode: BurstMode = 'cannon'
): BurstParticle[] =>
  boxes.map((box) => {
    const origin = cannonPositions[box.cannonIndex] ?? hiddenOrigin;
    return {
      originAndTiming: [origin.x, origin.y, 0, box.launchDelay],
      velocityAndDepth: [box.vx, box.vy, box.depthScale, box.initialRotation],
      rotationAndMeta: [
        box.maxRotation.x,
        box.maxRotation.z,
        box.clockwise ? 1 : -1,
        mode === 'pi' ? 0 : 1,
      ],
      indices: [
        box.sizeIndex,
        box.colorIndex,
        box.isTextured ? 1 : 0,
        box.cannonIndex,
      ],
    };
  });

export const toCannonPresetParticles = (
  particleSystem: CannonParticleSystem,
  cannonConfigs: CannonConfig[]
): BurstParticle[] =>
  particleSystem.particles.map((particle) => {
    const config = cannonConfigs[particle.originIndex] ?? cannonConfigs[0];
    const colorCount = Math.max(config?.colorCount ?? 1, 1);
    const sizeCount = Math.max(config?.sizeCount ?? 1, 1);

    // Mode 2 marks fitted motion. Its otherwise-unused lanes carry the fitted
    // size, drag, flip, angular velocity, and gravity without a second buffer.
    return {
      originAndTiming: [
        particle.x,
        particle.y,
        particle.startTime,
        particle.size,
      ],
      velocityAndDepth: [
        particle.velocityX,
        particle.velocityY,
        particle.horizontalDrag,
        particle.verticalDrag,
      ],
      rotationAndMeta: [
        particle.rotation,
        particle.angularVelocity,
        particle.rotationX,
        2 + Math.min(Math.max(particle.flipDepth, 0), 1),
      ],
      indices: [
        (config?.sizeStart ?? 0) +
          Math.min(Math.max(particle.sizeIndex, 0), sizeCount - 1),
        (config?.colorStart ?? 0) +
          Math.min(Math.max(particle.colorIndex, 0), colorCount - 1),
        particle.angularVelocityX,
        particle.gravity,
      ],
    };
  });

export const getPIBurstTotalCount = (configs: PIConfig[]) =>
  configs.reduce((sum, config) => sum + config.count, 0);

export const getCannonBurstTotalCount = (configs: CannonConfig[]) =>
  configs.reduce((sum, config) => sum + config.count, 0);

export const toPIBurstOrigins = (
  configs: PIConfig[],
  positions: Position[],
  delays: number[]
): GPUBurstOrigin[] => {
  let countStart = 0;
  return configs.map((config, index) => {
    const position =
      positions.length > 0
        ? (positions[index % positions.length] ?? hiddenOrigin)
        : hiddenOrigin;
    const rotation = config.rotation ?? DEFAULT_PI_CONFETTI_ROTATION;
    const rotationX = rotation.x ?? DEFAULT_PI_CONFETTI_ROTATION.x;
    const rotationZ = rotation.z ?? DEFAULT_PI_CONFETTI_ROTATION.z;
    const depth = config.depth ?? DEFAULT_PI_CONFETTI_DEPTH;
    const origin: GPUBurstOrigin = {
      originAndCount: [
        position.x,
        position.y,
        delays[index] ?? 0,
        config.count,
      ],
      targetStartAndMode: [0, 0, countStart, 0],
      motion: [
        config.spread,
        config.initialSpeed,
        config.speedVariation.min,
        config.speedVariation.max,
      ],
      selection: [
        config.colorStart,
        config.colorCount,
        config.sizeStart,
        config.sizeCount,
      ],
      rotation: [rotationX.min, rotationX.max, rotationZ.min, rotationZ.max],
      depth: [depth.min, depth.max, 0, 0],
    };
    countStart += config.count;
    return origin;
  });
};

export const toCannonBurstOrigins = (
  configs: CannonConfig[],
  positions: Position[]
): GPUBurstOrigin[] => {
  let countStart = 0;
  return configs.map((config, index) => {
    const position = positions[index] ?? hiddenOrigin;
    const rotation = config.rotation ?? DEFAULT_CANNON_CONFETTI_ROTATION;
    const rotationX = rotation.x ?? DEFAULT_CANNON_CONFETTI_ROTATION.x;
    const rotationZ = rotation.z ?? DEFAULT_CANNON_CONFETTI_ROTATION.z;
    const depth = config.depth ?? DEFAULT_CANNON_CONFETTI_DEPTH;
    const origin: GPUBurstOrigin = {
      originAndCount: [position.x, position.y, 0, config.count],
      targetStartAndMode: [config.target.x, config.target.y, countStart, 1],
      motion: [
        config.spread,
        config.speed,
        config.speedVariation.min,
        config.speedVariation.max,
      ],
      selection: [
        config.colorStart,
        config.colorCount,
        config.sizeStart,
        config.sizeCount,
      ],
      rotation: [rotationX.min, rotationX.max, rotationZ.min, rotationZ.max],
      depth: [depth.min, depth.max, 0, 0],
    };
    countStart += config.count;
    return origin;
  });
};
