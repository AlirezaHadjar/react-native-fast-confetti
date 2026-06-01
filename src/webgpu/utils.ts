import {
  DEFAULT_CONFETTI_ROTATION,
  DEFAULT_CONFETTI_WOBBLE,
  DEFAULT_ROTATIONAL_DAMPING,
  DEFAULT_TANGENTIAL_DRAG_RATIO,
  MAX_GRID_HEIGHT_RATIO,
  RANDOM_INITIAL_Y_JIGGLE,
  WOBBLE_MARGIN_BASE,
  WOBBLE_MARGIN_FALLBACK,
  WOBBLE_MARGIN_PER_UNIT,
} from '../constants';
import { DEFAULT_MAGNUS_STRENGTH, DEFAULT_Z_RANGE } from './constants';
import type { ColorRange } from '../hooks/useConfettiFlakes';
import type { Range, Rotation } from '../types';

export const getRandomValue = (min: number, max: number): number => {
  if (min === max) return min;
  return Math.random() * (max - min) + min;
};

export const resolveRange = (
  range: { min: number; max: number } | undefined,
  defaultRange: { min: number; max: number }
) => range ?? defaultRange;

export const computeSpawnGrid = ({
  count,
  maxFlakeWidth,
  maxFlakeHeight,
  containerWidth,
  containerHeight,
  verticalSpacing,
}: {
  count: number;
  maxFlakeWidth: number;
  maxFlakeHeight: number;
  containerWidth: number;
  containerHeight: number;
  verticalSpacing: number;
}) => {
  const horizontalSpacing = Math.max(0, containerWidth / count - maxFlakeWidth);
  let columnWidth = Math.min(maxFlakeWidth, 20) + horizontalSpacing;
  const rowHeight = Math.min(maxFlakeHeight, 20) + verticalSpacing;
  const maxGridHeight = containerHeight * MAX_GRID_HEIGHT_RATIO;

  let columnsNum = Math.max(1, Math.floor(containerWidth / columnWidth));
  let rowsNum = Math.ceil(count / columnsNum);

  if (rowsNum * rowHeight > maxGridHeight) {
    rowsNum = Math.max(1, Math.floor(maxGridHeight / rowHeight));
    columnsNum = Math.ceil(count / rowsNum);
    columnWidth = containerWidth / columnsNum;
  }

  const verticalOffset =
    -rowsNum * rowHeight +
    verticalSpacing -
    RANDOM_INITIAL_Y_JIGGLE -
    maxFlakeHeight * 0.5 -
    verticalSpacing / 2;

  return { columnsNum, rowsNum, rowHeight, columnWidth, verticalOffset };
};

const tumblingTerminalVelocity = (scaledGravity: number): number => {
  const Cn = 4.0 / scaledGravity;
  const Ct = Cn * DEFAULT_TANGENTIAL_DRAG_RATIO;
  const angleAvgDrag = (Cn + Ct) * (4 / (3 * Math.PI));
  return Math.sqrt(scaledGravity / angleAvgDrag);
};

const fallTimeFromRest = (
  distance: number,
  terminalVelocity: number,
  gravity: number
): number => {
  const normalizedDistance =
    (gravity * distance) / (terminalVelocity * terminalVelocity);
  if (normalizedDistance > 20) {
    return (
      distance / terminalVelocity + (terminalVelocity / gravity) * Math.LN2
    );
  }
  return (
    (terminalVelocity / gravity) * Math.acosh(Math.exp(normalizedDistance))
  );
};

export const estimateFallingDuration = ({
  gravity,
  containerHeight,
  verticalOffset,
  maxWobble,
}: {
  gravity: number;
  containerHeight: number;
  verticalOffset: number;
  maxWobble?: number;
}): number => {
  const scaledGravity = Math.max(gravity * containerHeight, 0.001);
  const terminalVelocity = tumblingTerminalVelocity(scaledGravity);
  const totalFallDistance = containerHeight + Math.abs(verticalOffset);
  const timeSec = fallTimeFromRest(
    totalFallDistance,
    terminalVelocity,
    scaledGravity
  );
  const wobbleMargin =
    WOBBLE_MARGIN_BASE +
    (maxWobble ?? WOBBLE_MARGIN_FALLBACK) * WOBBLE_MARGIN_PER_UNIT;
  return Math.ceil(timeSec * 1000 * wobbleMargin);
};

const generatePhaseOffsets = (count: number): number[] => {
  const offsets = new Array<number>(count);
  for (let i = 0; i < count; i++) {
    offsets[i] = (i + Math.random()) / count;
  }
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = offsets[i] ?? 0;
    offsets[i] = offsets[j] ?? 0;
    offsets[j] = tmp;
  }
  return offsets;
};

const calculateGridSpawnX = (
  i: number,
  columnsNum: number,
  rowsNum: number,
  count: number,
  containerWidth: number,
  maxFlakeWidth: number,
  columnWidth: number
): number => {
  const rowIndex = Math.floor(i / columnsNum);
  const isLastRow = rowIndex === rowsNum - 1;
  if (isLastRow) {
    const itemsInLastRow = count - (rowsNum - 1) * columnsNum;
    const lastRowSpacing =
      (containerWidth - itemsInLastRow * maxFlakeWidth) / (itemsInLastRow + 1);
    const positionInLastRow = i - (rowsNum - 1) * columnsNum;
    return (
      lastRowSpacing + positionInLastRow * (maxFlakeWidth + lastRowSpacing)
    );
  }
  return (i % columnsNum) * columnWidth;
};

const randomUnitQuat = (): [number, number, number, number] => {
  // Shoemake uniform quaternion on S^3.
  const u1 = Math.random();
  const u2 = Math.random();
  const u3 = Math.random();
  const s1 = Math.sqrt(1 - u1);
  const s2 = Math.sqrt(u1);
  return [
    s1 * Math.sin(2 * Math.PI * u2),
    s1 * Math.cos(2 * Math.PI * u2),
    s2 * Math.sin(2 * Math.PI * u3),
    s2 * Math.cos(2 * Math.PI * u3),
  ];
};

export type Spawn = {
  pos0: [number, number, number];
  vel0: [number, number, number];
  quat0: [number, number, number, number];
  omega0: [number, number, number];
  drag: [number, number, number, number];
  meta: [number, number, number, number];
};

export const generateSpawnsArray = ({
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
}: {
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
  zRange?: [number, number];
}): Spawn[] => {
  const xRot = resolveRange(rotation?.x, DEFAULT_CONFETTI_ROTATION.x);
  const zRot = resolveRange(rotation?.z, DEFAULT_CONFETTI_ROTATION.z);
  const wobbleRange = resolveRange(wobble, DEFAULT_CONFETTI_WOBBLE);
  void depth;

  const scaledGravity = gravity * containerHeight;
  const Cn = 4.0 / scaledGravity;
  const Ct = Cn * DEFAULT_TANGENTIAL_DRAG_RATIO;
  const cAvg = ((Cn + Ct) * 4) / (3 * Math.PI);
  const vTermApprox = Math.sqrt(scaledGravity / cAvg);
  const rowHeight = Math.min(maxFlakeHeight, 20) + verticalSpacing;

  const phaseOffsets = continuous ? generatePhaseOffsets(count) : [];
  const spawns: Spawn[] = new Array(count);

  for (let i = 0; i < count; i++) {
    const rowIndex = Math.floor(i / columnsNum);
    const x = calculateGridSpawnX(
      i,
      columnsNum,
      rowsNum,
      count,
      containerWidth,
      maxFlakeWidth,
      columnWidth
    );
    const yJitter = getRandomValue(-verticalSpacing / 2, verticalSpacing / 2);
    const y = rowIndex * rowHeight + verticalOffset + yJitter;
    const z = getRandomValue(zRange[0], zRange[1]);

    const initialVy = infinite
      ? vTermApprox * getRandomValue(0.95, 1.05)
      : getRandomValue(0, 0.4) * scaledGravity;
    const initialVx = getRandomValue(-0.15, 0.15) * scaledGravity;
    const initialVz = getRandomValue(-0.05, 0.05) * scaledGravity;

    const tumbleMag =
      getRandomValue(xRot.min, xRot.max) / Math.max(totalTime, 0.0001);
    const twistMag =
      getRandomValue(zRot.min, zRot.max) / Math.max(totalTime, 0.0001);
    const axisTheta = Math.random() * Math.PI * 2;
    const tumbleX = Math.cos(axisTheta) * tumbleMag;
    const tumbleY = Math.sin(axisTheta) * tumbleMag;
    const twistZ = (Math.random() < 0.5 ? 1 : -1) * twistMag;

    const quat = randomUnitQuat();
    const wob = getRandomValue(wobbleRange.min, wobbleRange.max);
    const cnScaled = Cn * (1 + wob * 4);
    const ctScaled = Ct * (1 + wob * 4);

    const sizeIndex = Math.round(getRandomValue(0, sizeVariations - 1));
    const range = sizeColorOverrides[sizeIndex];
    const colorIndex = range
      ? range.start + Math.round(getRandomValue(0, range.count - 1))
      : Math.round(getRandomValue(0, parentColorCount - 1));
    const flags = sizeFlagsByIndex[sizeIndex] ?? 0;
    const phaseOffset = (continuous ? phaseOffsets[i] : 0) ?? 0;

    spawns[i] = {
      pos0: [x, y, z],
      vel0: [initialVx, initialVy, initialVz],
      quat0: quat,
      omega0: [tumbleX, tumbleY, twistZ],
      drag: [cnScaled, ctScaled, DEFAULT_ROTATIONAL_DAMPING, DEFAULT_MAGNUS_STRENGTH],
      meta: [sizeIndex, colorIndex, flags, phaseOffset],
    };
  }

  return spawns;
};
