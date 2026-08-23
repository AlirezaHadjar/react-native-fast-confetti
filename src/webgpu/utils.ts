import {
  DEFAULT_TANGENTIAL_DRAG_RATIO,
  MAX_GRID_HEIGHT_RATIO,
  RANDOM_INITIAL_Y_JIGGLE,
  WOBBLE_MARGIN_BASE,
  WOBBLE_MARGIN_FALLBACK,
  WOBBLE_MARGIN_PER_UNIT,
} from '../constants';

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
  const normalDrag = 4 / scaledGravity;
  const tangentialDrag = normalDrag * DEFAULT_TANGENTIAL_DRAG_RATIO;
  const averageDrag = (normalDrag + tangentialDrag) * (4 / (3 * Math.PI));
  return Math.sqrt(scaledGravity / averageDrag);
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
