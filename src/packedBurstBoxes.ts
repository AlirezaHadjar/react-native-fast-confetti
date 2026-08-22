import {
  DEFAULT_CANNON_CONFETTI_DEPTH,
  DEFAULT_CANNON_CONFETTI_ROTATION,
  DEFAULT_CANNON_CONFETTI_SPEED_VARIATION,
  DEFAULT_PI_CONFETTI_DEPTH,
  DEFAULT_PI_CONFETTI_ROTATION,
  DEFAULT_PI_CONFETTI_SPEED_VARIATION,
} from './constants';
import type { ColorRange } from './hooks/useConfettiFlakes';
import type { Position } from './types';
import type { CannonConfig, PIConfig } from './utils';
import {
  getRandomBoolean,
  getRandomValue,
  resolveRange,
} from './utils';

export const BURST_FLOAT_STRIDE = 8;
export const BURST_META_STRIDE = 4;

export const BURST_VX = 0;
export const BURST_VY = 1;
export const BURST_LAUNCH_DELAY = 2;
export const BURST_DEPTH_SCALE = 3;
export const BURST_ROTATION_X = 4;
export const BURST_ROTATION_Z = 5;
export const BURST_INITIAL_ROTATION = 6;
export const BURST_ORIGIN_DELAY = 7;

export const BURST_ORIGIN_INDEX = 0;
export const BURST_COLOR_INDEX = 1;
export const BURST_SIZE_INDEX = 2;
export const BURST_FLAGS = 3;

export const BURST_FLAG_CLOCKWISE = 1 << 0;
export const BURST_FLAG_TEXTURED = 1 << 1;

export type PackedBurstBoxes = {
  values: Float64Array;
  metadata: Int32Array;
};

const createPackedBoxes = (count: number): PackedBurstBoxes => {
  'worklet';
  return {
    values: new Float64Array(count * BURST_FLOAT_STRIDE),
    metadata: new Int32Array(count * BURST_META_STRIDE),
  };
};

const writeCommon = (
  packed: PackedBurstBoxes,
  index: number,
  originIndex: number,
  vx: number,
  vy: number,
  launchDelay: number,
  depthScale: number,
  clockwise: boolean,
  rotationX: number,
  rotationZ: number,
  colorIndex: number,
  sizeIndex: number,
  initialRotation: number,
  isTextured: boolean,
  originDelay: number
) => {
  'worklet';
  const valueOffset = index * BURST_FLOAT_STRIDE;
  packed.values[valueOffset + BURST_VX] = vx;
  packed.values[valueOffset + BURST_VY] = vy;
  packed.values[valueOffset + BURST_LAUNCH_DELAY] = launchDelay;
  packed.values[valueOffset + BURST_DEPTH_SCALE] = depthScale;
  packed.values[valueOffset + BURST_ROTATION_X] = rotationX;
  packed.values[valueOffset + BURST_ROTATION_Z] = rotationZ;
  packed.values[valueOffset + BURST_INITIAL_ROTATION] = initialRotation;
  packed.values[valueOffset + BURST_ORIGIN_DELAY] = originDelay;

  const metaOffset = index * BURST_META_STRIDE;
  packed.metadata[metaOffset + BURST_ORIGIN_INDEX] = originIndex;
  packed.metadata[metaOffset + BURST_COLOR_INDEX] = colorIndex;
  packed.metadata[metaOffset + BURST_SIZE_INDEX] = sizeIndex;
  packed.metadata[metaOffset + BURST_FLAGS] =
    (clockwise ? BURST_FLAG_CLOCKWISE : 0) |
    (isTextured ? BURST_FLAG_TEXTURED : 0);
};

type SharedPackingInput = {
  containerHeight: number;
  launchDelayMax: number;
  sizeColorOverrides: (ColorRange | null)[];
  parentColorCount: number;
  sizeIsTextured: boolean[];
};

export const generatePackedPIBoxes = ({
  piConfigs,
  originDelays,
  containerHeight,
  launchDelayMax,
  sizeColorOverrides,
  parentColorCount,
  sizeIsTextured,
}: SharedPackingInput & {
  piConfigs: PIConfig[];
  originDelays: number[];
}): PackedBurstBoxes => {
  'worklet';
  let count = 0;
  for (const config of piConfigs) count += config.count;
  const packed = createPackedBoxes(count);
  let index = 0;

  for (let originIndex = 0; originIndex < piConfigs.length; originIndex++) {
    const config = piConfigs[originIndex];
    if (!config) continue;
    const rotation = config.rotation ?? DEFAULT_PI_CONFETTI_ROTATION;
    const depth = config.depth ?? DEFAULT_PI_CONFETTI_DEPTH;
    const xRotationRange = resolveRange(
      rotation.x,
      DEFAULT_PI_CONFETTI_ROTATION.x
    );
    const zRotationRange = resolveRange(
      rotation.z,
      DEFAULT_PI_CONFETTI_ROTATION.z
    );
    const speedRange = resolveRange(
      config.speedVariation,
      DEFAULT_PI_CONFETTI_SPEED_VARIATION
    );
    const depthRange = resolveRange(depth, DEFAULT_PI_CONFETTI_DEPTH);
    const halfSpread = config.spread / 2;
    const baseAngle = -Math.PI / 2;

    for (let pieceIndex = 0; pieceIndex < config.count; pieceIndex++) {
      const angle =
        baseAngle +
        ((((pieceIndex * 137.5) % 360) * Math.PI) / 180 - Math.PI) *
          (halfSpread / Math.PI);
      const sizeIndex = Math.round(
        getRandomValue(
          config.sizeStart,
          config.sizeStart + config.sizeCount - 1
        )
      );
      const range = sizeColorOverrides[sizeIndex];
      const speedMultiplier = getRandomValue(speedRange.min, speedRange.max);
      const depthScale = getRandomValue(depthRange.min, depthRange.max);
      const speed =
        config.initialSpeed * containerHeight * speedMultiplier * depthScale;
      const launchDelay = getRandomValue(0, launchDelayMax);
      const clockwise = getRandomBoolean();
      const rotationX = getRandomValue(
        xRotationRange.min,
        xRotationRange.max
      );
      const rotationZ = getRandomValue(
        zRotationRange.min,
        zRotationRange.max
      );
      const colorIndex = range
        ? range.start + Math.round(getRandomValue(0, range.count - 1))
        : Math.round(getRandomValue(0, parentColorCount - 1));
      const initialRotation = getRandomValue(0.1 * Math.PI, Math.PI);

      writeCommon(
        packed,
        index++,
        originIndex,
        speed * Math.cos(angle),
        speed * Math.sin(angle),
        launchDelay,
        depthScale,
        clockwise,
        rotationX,
        rotationZ,
        colorIndex,
        sizeIndex,
        initialRotation,
        sizeIsTextured[sizeIndex] ?? false,
        originDelays[originIndex] ?? 0
      );
    }
  }

  return packed;
};

export const generatePackedCannonBoxes = ({
  cannonConfigs,
  cannonsPositions,
  containerHeight,
  launchDelayMax,
  sizeColorOverrides,
  parentColorCount,
  sizeIsTextured,
}: SharedPackingInput & {
  cannonConfigs: CannonConfig[];
  cannonsPositions: Position[];
}): PackedBurstBoxes => {
  'worklet';
  let count = 0;
  for (const config of cannonConfigs) count += config.count;
  const packed = createPackedBoxes(count);
  let index = 0;

  for (let originIndex = 0; originIndex < cannonConfigs.length; originIndex++) {
    const config = cannonConfigs[originIndex];
    if (!config) continue;
    const rotation = config.rotation ?? DEFAULT_CANNON_CONFETTI_ROTATION;
    const depth = config.depth ?? DEFAULT_CANNON_CONFETTI_DEPTH;
    const xRotationRange = resolveRange(
      rotation.x,
      DEFAULT_CANNON_CONFETTI_ROTATION.x
    );
    const zRotationRange = resolveRange(
      rotation.z,
      DEFAULT_CANNON_CONFETTI_ROTATION.z
    );
    const speedRange = resolveRange(
      config.speedVariation,
      DEFAULT_CANNON_CONFETTI_SPEED_VARIATION
    );
    const depthRange = resolveRange(depth, DEFAULT_CANNON_CONFETTI_DEPTH);
    const halfSpread = config.spread / 2;
    const origin = cannonsPositions[originIndex];
    const baseAngle = origin
      ? Math.atan2(config.target.y - origin.y, config.target.x - origin.x)
      : 0;

    for (let pieceIndex = 0; pieceIndex < config.count; pieceIndex++) {
      const sizeIndex = Math.round(
        getRandomValue(
          config.sizeStart,
          config.sizeStart + config.sizeCount - 1
        )
      );
      const range = sizeColorOverrides[sizeIndex];
      const angle = baseAngle + getRandomValue(-halfSpread, halfSpread);
      const speedMultiplier = getRandomValue(speedRange.min, speedRange.max);
      const depthScale = getRandomValue(depthRange.min, depthRange.max);
      const speed =
        config.speed * containerHeight * speedMultiplier * depthScale;
      const launchDelay = getRandomValue(0, launchDelayMax);
      const clockwise = getRandomBoolean();
      const rotationX = getRandomValue(
        xRotationRange.min,
        xRotationRange.max
      );
      const rotationZ = getRandomValue(
        zRotationRange.min,
        zRotationRange.max
      );
      const colorIndex = range
        ? range.start + Math.round(getRandomValue(0, range.count - 1))
        : Math.round(getRandomValue(0, parentColorCount - 1));
      const initialRotation = getRandomValue(0.1 * Math.PI, Math.PI);

      writeCommon(
        packed,
        index++,
        originIndex,
        speed * Math.cos(angle),
        speed * Math.sin(angle),
        launchDelay,
        depthScale,
        clockwise,
        rotationX,
        rotationZ,
        colorIndex,
        sizeIndex,
        initialRotation,
        sizeIsTextured[sizeIndex] ?? false,
        0
      );
    }
  }

  return packed;
};
