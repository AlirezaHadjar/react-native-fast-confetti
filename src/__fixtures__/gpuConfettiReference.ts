import {
  DEFAULT_CONFETTI_DEPTH,
  DEFAULT_CONFETTI_ROTATION,
  DEFAULT_CONFETTI_WOBBLE,
  DEFAULT_ROTATIONAL_DAMPING,
  DEFAULT_TANGENTIAL_DRAG_RATIO,
} from '../constants';
import type { ColorRange } from '../hooks/useConfettiFlakes';
import type { FixedLengthArray } from '../typeHelpers';
import type { Range, Rotation } from '../types';
import { getRandomValue, resolveRange } from '../utils';
import {
  DEFAULT_FOCAL_LENGTH_RATIO,
  DEFAULT_MAGNUS_STRENGTH,
  DEFAULT_Z_RANGE,
} from '../webgpu/constants';

const generatePhaseOffsets = (count: number): number[] => {
  const offsets = new Array<number>(count);
  for (let index = 0; index < count; index++) {
    offsets[index] = (index + Math.random()) / count;
  }
  for (let index = count - 1; index > 0; index--) {
    const otherIndex = Math.floor(Math.random() * (index + 1));
    const value = offsets[index] ?? 0;
    offsets[index] = offsets[otherIndex] ?? 0;
    offsets[otherIndex] = value;
  }
  return offsets;
};

const calculateGridSpawnX = (
  index: number,
  columnsNum: number,
  rowsNum: number,
  count: number,
  containerWidth: number,
  maxFlakeWidth: number,
  columnWidth: number
): number => {
  const rowIndex = Math.floor(index / columnsNum);
  if (rowIndex === rowsNum - 1) {
    const itemsInLastRow = count - (rowsNum - 1) * columnsNum;
    const lastRowSpacing =
      (containerWidth - itemsInLastRow * maxFlakeWidth) / (itemsInLastRow + 1);
    const positionInLastRow = index - (rowsNum - 1) * columnsNum;
    return (
      lastRowSpacing + positionInLastRow * (maxFlakeWidth + lastRowSpacing)
    );
  }
  return (index % columnsNum) * columnWidth;
};

const randomUnitQuaternion = (): FixedLengthArray<number, 4> => {
  const first = Math.random();
  const second = Math.random();
  const third = Math.random();
  const firstScale = Math.sqrt(1 - first);
  const secondScale = Math.sqrt(first);
  return [
    firstScale * Math.sin(2 * Math.PI * second),
    firstScale * Math.cos(2 * Math.PI * second),
    secondScale * Math.sin(2 * Math.PI * third),
    secondScale * Math.cos(2 * Math.PI * third),
  ];
};

export type ReferenceSpawn = {
  pos0: FixedLengthArray<number, 3>;
  vel0: FixedLengthArray<number, 3>;
  quat0: FixedLengthArray<number, 4>;
  omega0: FixedLengthArray<number, 3>;
  drag: FixedLengthArray<number, 4>;
  meta: FixedLengthArray<number, 4>;
};

type GenerateReferenceSpawnsParams = {
  count: number;
  sizeVariations: number;
  sizeColorOverrides: (ColorRange | null)[];
  parentColorCount: number;
  sizeFlagsByIndex: number[];
  containerWidth: number;
  containerHeight: number;
  verticalSpacing: number;
  maxFlakeWidth: number;
  maxFlakeHeight: number;
  verticalOffset: number;
  columnsNum: number;
  rowsNum: number;
  columnWidth: number;
  rotation?: Rotation;
  depth?: Range;
  wobble?: Range;
  totalTime: number;
  gravity: number;
  infinite?: boolean;
  continuous?: boolean;
  zRange?: FixedLengthArray<number, 2>;
};

/** CPU reference for checking parity with the GPU initialization shader. */
export const generateReferenceSpawns = ({
  count,
  sizeVariations,
  sizeColorOverrides,
  parentColorCount,
  sizeFlagsByIndex,
  containerWidth,
  containerHeight,
  verticalSpacing,
  maxFlakeWidth,
  maxFlakeHeight,
  verticalOffset,
  columnsNum,
  rowsNum,
  columnWidth,
  rotation,
  depth,
  wobble,
  totalTime,
  gravity,
  infinite,
  continuous,
  zRange = DEFAULT_Z_RANGE,
}: GenerateReferenceSpawnsParams): ReferenceSpawn[] => {
  const rotationX = resolveRange(rotation?.x, DEFAULT_CONFETTI_ROTATION.x);
  const rotationZ = resolveRange(rotation?.z, DEFAULT_CONFETTI_ROTATION.z);
  const depthRange = resolveRange(depth, DEFAULT_CONFETTI_DEPTH);
  const wobbleRange = resolveRange(wobble, DEFAULT_CONFETTI_WOBBLE);
  const focalLength = Math.max(
    100,
    containerHeight * DEFAULT_FOCAL_LENGTH_RATIO
  );

  const scaledGravity = gravity * containerHeight;
  const normalDrag = 4 / scaledGravity;
  const tangentialDrag = normalDrag * DEFAULT_TANGENTIAL_DRAG_RATIO;
  const averageDrag = ((normalDrag + tangentialDrag) * 4) / (3 * Math.PI);
  const terminalVelocity = Math.sqrt(scaledGravity / averageDrag);
  const rowHeight = Math.min(maxFlakeHeight, 20) + verticalSpacing;
  const phaseOffsets = continuous ? generatePhaseOffsets(count) : [];
  const spawns = new Array<ReferenceSpawn>(count);

  for (let index = 0; index < count; index++) {
    const rowIndex = Math.floor(index / columnsNum);
    const x = calculateGridSpawnX(
      index,
      columnsNum,
      rowsNum,
      count,
      containerWidth,
      maxFlakeWidth,
      columnWidth
    );
    const y =
      rowIndex * rowHeight +
      verticalOffset +
      getRandomValue(-verticalSpacing / 2, verticalSpacing / 2);
    const depthScale = getRandomValue(depthRange.min, depthRange.max);
    const perspectiveZ =
      focalLength / Math.max(depthScale, 0.0001) - focalLength;
    const z = perspectiveZ + getRandomValue(zRange[0], zRange[1]);

    const initialVy = infinite
      ? terminalVelocity * getRandomValue(0.95, 1.05)
      : getRandomValue(0, 0.4) * scaledGravity;
    const initialVx = getRandomValue(-0.15, 0.15) * scaledGravity;
    const initialVz = getRandomValue(-0.05, 0.05) * scaledGravity;
    const tumbleMagnitude =
      getRandomValue(rotationX.min, rotationX.max) /
      Math.max(totalTime, 0.0001);
    const twistMagnitude =
      getRandomValue(rotationZ.min, rotationZ.max) /
      Math.max(totalTime, 0.0001);
    const axisTheta = Math.random() * Math.PI * 2;
    const wobbleValue = getRandomValue(wobbleRange.min, wobbleRange.max);
    const sizeIndex = Math.round(getRandomValue(0, sizeVariations - 1));
    const colorRange = sizeColorOverrides[sizeIndex];
    const colorIndex = colorRange
      ? colorRange.start + Math.round(getRandomValue(0, colorRange.count - 1))
      : Math.round(getRandomValue(0, parentColorCount - 1));

    spawns[index] = {
      pos0: [x, y, z],
      vel0: [initialVx, initialVy, initialVz],
      quat0: randomUnitQuaternion(),
      omega0: [
        Math.cos(axisTheta) * tumbleMagnitude,
        Math.sin(axisTheta) * tumbleMagnitude,
        (Math.random() < 0.5 ? 1 : -1) * twistMagnitude,
      ],
      drag: [
        normalDrag * (1 + wobbleValue * 4),
        tangentialDrag * (1 + wobbleValue * 4),
        DEFAULT_ROTATIONAL_DAMPING,
        DEFAULT_MAGNUS_STRENGTH,
      ],
      meta: [
        sizeIndex,
        colorIndex,
        sizeFlagsByIndex[sizeIndex] ?? 0,
        (continuous ? phaseOffsets[index] : 0) ?? 0,
      ],
    };
  }

  return spawns;
};

export const toReferenceSpawnInputs = (spawns: ReferenceSpawn[]) =>
  spawns.map((spawn) => ({
    pos0: spawn.pos0,
    vel0: spawn.vel0,
    quat0: spawn.quat0,
    omega0: spawn.omega0,
    drag: spawn.drag,
    info: spawn.meta,
  }));

export const toReferenceRuntimeInputs = (
  spawns: ReferenceSpawn[],
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
