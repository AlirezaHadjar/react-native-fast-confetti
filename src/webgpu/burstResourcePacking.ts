import type { SizeVariation } from '../hooks/useConfettiFlakes';
import type { Position } from '../types';
import type { CannonConfig, PIConfig } from '../utils';
import { computeSizeFlags, toSizeInputs } from './resourcePacking';

export type BurstMode = 'pi' | 'cannon';

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
  originAndTiming: [number, number, number, number];
  velocityAndDepth: [number, number, number, number];
  rotationAndMeta: [number, number, number, number];
  indices: [number, number, number, number];
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
      originAndTiming: [
        origin.x,
        origin.y,
        box.originDelay,
        box.launchDelay,
      ],
      velocityAndDepth: [
        box.vx,
        box.vy,
        box.depthScale,
        box.initialRotation,
      ],
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
      originAndTiming: [
        origin.x,
        origin.y,
        0,
        box.launchDelay,
      ],
      velocityAndDepth: [
        box.vx,
        box.vy,
        box.depthScale,
        box.initialRotation,
      ],
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

export const getPIBurstTotalCount = (configs: PIConfig[]) =>
  configs.reduce((sum, config) => sum + config.count, 0);

export const getCannonBurstTotalCount = (configs: CannonConfig[]) =>
  configs.reduce((sum, config) => sum + config.count, 0);
