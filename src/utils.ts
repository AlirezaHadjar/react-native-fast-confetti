import {
  DEFAULT_CANNON_CONFETTI_DEPTH,
  DEFAULT_CANNON_CONFETTI_LAUNCH_DELAY_MAX,
  DEFAULT_CANNON_CONFETTI_ROTATION,
  DEFAULT_CANNON_CONFETTI_SPEED_VARIATION,
  DEFAULT_CONFETTI_DEPTH,
  DEFAULT_CONFETTI_ROTATION,
  DEFAULT_CONFETTI_WOBBLE,
  DEFAULT_PI_CONFETTI_DEPTH,
  DEFAULT_PI_CONFETTI_LAUNCH_DELAY_MAX,
  DEFAULT_PI_CONFETTI_ROTATION,
  DEFAULT_PI_CONFETTI_SPEED_VARIATION,
  DEFAULT_ROTATIONAL_DAMPING,
  DEFAULT_TANGENTIAL_DRAG_RATIO,
  MAX_GRID_HEIGHT_RATIO,
  RANDOM_INITIAL_Y_JIGGLE,
  TRAJECTORY_SAMPLE_COUNT,
  WOBBLE_MARGIN_BASE,
  WOBBLE_MARGIN_FALLBACK,
  WOBBLE_MARGIN_PER_UNIT,
} from './constants';
import type { ColorRange } from './hooks/useConfettiFlakes';
import { integrateTrajectory } from './physics';
import type {
  FallingBox,
  NamedPosition,
  Position,
  Range,
  Rotation,
} from './types';

export const getRandomBoolean = () => {
  'worklet';
  return Math.random() >= 0.5;
};

export const getRandomValue = (min: number, max: number): number => {
  'worklet';
  if (min === max) return min;
  return Math.random() * (max - min) + min;
};

export const resolveRange = (
  range: { min: number; max: number } | undefined,
  defaultRange: { min: number; max: number }
) => {
  'worklet';
  return range ?? defaultRange;
};

type BoxBase = {
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

type OriginConfigBase = {
  spread: number;
  count: number;
  speedVariation: Required<Range>;
  colorStart: number;
  colorCount: number;
  sizeStart: number;
  sizeCount: number;
  rotation?: Rotation;
  depth?: Range;
};

export type PIConfig = OriginConfigBase & {
  initialSpeed: number;
};

export const generatePIBoxesArray = ({
  piConfigs,
  originDelays,
  containerHeight,
  launchDelayMax,
  sizeColorOverrides,
  parentColorCount,
  sizeIsTextured,
}: {
  piConfigs: PIConfig[];
  originDelays: number[];
  containerHeight: number;
  launchDelayMax: number;
  sizeColorOverrides: (ColorRange | null)[];
  parentColorCount: number;
  sizeIsTextured: boolean[];
}) => {
  'worklet';

  const result: (BoxBase & {
    originIndex: number;
    originDelay: number;
    speedMultiplier: number;
  })[] = [];

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
    // Center the spread around "upward" (-PI/2)
    const baseAngle = -Math.PI / 2;

    for (let j = 0; j < config.count; j++) {
      // Golden angle distribution mapped to spread range
      const goldenAngle =
        baseAngle +
        ((((j * 137.5) % 360) * Math.PI) / 180 - Math.PI) *
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

      result.push({
        originIndex,
        originDelay: originDelays[originIndex] ?? 0,
        vx: speed * Math.cos(goldenAngle),
        vy: speed * Math.sin(goldenAngle),
        speedMultiplier,
        launchDelay: getRandomValue(0, launchDelayMax),
        depthScale,
        clockwise: getRandomBoolean(),
        maxRotation: {
          x: getRandomValue(xRotationRange.min, xRotationRange.max),
          z: getRandomValue(zRotationRange.min, zRotationRange.max),
        },
        colorIndex: range
          ? range.start + Math.round(getRandomValue(0, range.count - 1))
          : Math.round(getRandomValue(0, parentColorCount - 1)),
        sizeIndex,
        initialRotation: getRandomValue(0.1 * Math.PI, Math.PI),
        isTextured: sizeIsTextured[sizeIndex] ?? false,
      });
    }
  }

  return result;
};

export const estimatePIDuration = ({
  piConfigs,
  blastPositions,
  originDelays,
  gravity,
  vDrag,
  sprayDurationMs,
  containerHeight,
}: {
  piConfigs: PIConfig[];
  blastPositions: Position[];
  originDelays: number[];
  gravity: number;
  vDrag: number;
  sprayDurationMs?: number;
  containerHeight: number;
}): { flightDuration: number; totalDuration: number } => {
  const safeDrag = Math.max(vDrag, 0.001);
  const scaledGravity = Math.max(gravity * containerHeight, 0.001);
  const terminalVelocity = scaledGravity / safeDrag;

  let maxFlightTimeSec = 0;

  for (let i = 0; i < piConfigs.length; i++) {
    const config = piConfigs[i];
    if (!config) continue;
    const blastY = blastPositions[i]?.y ?? containerHeight / 2;

    const depthMax = config.depth?.max ?? DEFAULT_PI_CONFETTI_DEPTH.max;
    const maxSpeedVar =
      config.speedVariation?.max ?? DEFAULT_PI_CONFETTI_SPEED_VARIATION.max;
    const maxSpeed =
      config.initialSpeed * maxSpeedVar * depthMax * containerHeight;

    const vy = -maxSpeed;
    const piLogArg = 1 - (vy * safeDrag) / scaledGravity;
    const apexTime =
      piLogArg > 0 ? Math.log(piLogArg) / safeDrag : 0;

    const expAtApex = 1 - Math.exp(-safeDrag * apexTime);
    const apexY =
      blastY +
      (scaledGravity / safeDrag) * apexTime +
      ((vy - scaledGravity / safeDrag) / safeDrag) * expAtApex;

    const remainingFall = containerHeight - apexY;
    const fallTime =
      remainingFall > 0
        ? fallTimeFromRest(remainingFall, terminalVelocity, scaledGravity)
        : 0;

    const totalTimeSec = (apexTime + fallTime) * 1.2;
    if (totalTimeSec > maxFlightTimeSec) {
      maxFlightTimeSec = totalTimeSec;
    }
  }

  let flightDuration: number;
  if (sprayDurationMs !== undefined) {
    flightDuration = Math.ceil(maxFlightTimeSec * 1000 + sprayDurationMs);
  } else {
    flightDuration = Math.ceil(
      (maxFlightTimeSec * 1000) / (1 - DEFAULT_PI_CONFETTI_LAUNCH_DELAY_MAX)
    );
  }

  const maxOriginDelay = originDelays.reduce((max, d) => Math.max(max, d), 0);
  const totalDuration = flightDuration + maxOriginDelay;

  return { flightDuration, totalDuration };
};

const EDGE_OFFSET = 30;

const POSITION_RESOLVERS: Record<
  NamedPosition,
  (w: number, h: number, o: number) => Position
> = {
  'bottom-left': (_w, h, o) => ({ x: -o, y: h + o }),
  'bottom-right': (w, h, o) => ({ x: w + o, y: h + o }),
  'bottom-center': (w, h, o) => ({ x: w / 2, y: h + o }),
  'top-left': (_w, _h, o) => ({ x: -o, y: -o }),
  'top-right': (w, _h, o) => ({ x: w + o, y: -o }),
  'top-center': (w, _h, o) => ({ x: w / 2, y: -o }),
  'center-left': (_w, h, o) => ({ x: -o, y: h / 2 }),
  'center-right': (w, h, o) => ({ x: w + o, y: h / 2 }),
  'center': (w, h) => ({ x: w / 2, y: h / 2 }),
};

export const resolveNamedPosition = (
  position: NamedPosition | Position,
  containerWidth: number,
  containerHeight: number
): Position => {
  if (typeof position === 'object') return position;
  return POSITION_RESOLVERS[position](
    containerWidth,
    containerHeight,
    EDGE_OFFSET
  );
};

export type CannonConfig = OriginConfigBase & {
  speed: number;
  target: Position;
};

export const estimateCannonDuration = ({
  cannonConfigs,
  cannonsPositions,
  gravity,
  drag,
  sprayDurationMs,
  containerHeight,
}: {
  cannonConfigs: CannonConfig[];
  cannonsPositions: Position[];
  gravity: number;
  drag: number;
  sprayDurationMs?: number;
  containerHeight: number;
}): number => {
  const safeDrag = Math.max(drag, 0.001);
  const scaledGravity = Math.max(gravity * containerHeight, 0.001);
  const terminalVelocity = scaledGravity / safeDrag;

  let maxFlightTimeSec = 0;

  for (let i = 0; i < cannonConfigs.length; i++) {
    const config = cannonConfigs[i];
    if (!config) continue;
    const cannonY = cannonsPositions[i]?.y ?? containerHeight / 2;

    const depthMax = config.depth?.max ?? DEFAULT_CANNON_CONFETTI_DEPTH.max;
    const maxSpeedMul = config.speed * config.speedVariation.max * depthMax;
    // Worst-case vertical launch speed (most upward component)
    const vy = -maxSpeedMul * containerHeight;

    // Time to reach apex: vy + (g/drag)*t + ((vy - g/drag)/drag)*(1 - e^(-drag*t)) derivative = 0
    // v(t) = g/drag + (vy - g/drag) * e^(-drag*t) = 0
    // e^(-drag*t) = -g / (drag * (vy - g/drag)) = g / (g - vy*drag)
    const logArg = 1 - (vy * safeDrag) / scaledGravity;
    const apexTime =
      logArg > 0 ? Math.log(logArg) / safeDrag : 0;

    // Position at apex
    const expAtApex = 1 - Math.exp(-safeDrag * apexTime);
    const apexY =
      cannonY +
      (scaledGravity / safeDrag) * apexTime +
      ((vy - scaledGravity / safeDrag) / safeDrag) * expAtApex;

    // Fall from apex to container bottom
    const remainingFall = containerHeight - apexY;
    const fallTime =
      remainingFall > 0
        ? fallTimeFromRest(remainingFall, terminalVelocity, scaledGravity)
        : 0;

    const totalTimeSec = (apexTime + fallTime) * 1.2;
    if (totalTimeSec > maxFlightTimeSec) {
      maxFlightTimeSec = totalTimeSec;
    }
  }

  if (sprayDurationMs !== undefined) {
    return Math.ceil(maxFlightTimeSec * 1000 + sprayDurationMs);
  }
  return Math.ceil(
    (maxFlightTimeSec * 1000) / (1 - DEFAULT_CANNON_CONFETTI_LAUNCH_DELAY_MAX)
  );
};

export const generateCannonBoxesArray = ({
  cannonConfigs,
  cannonsPositions,
  containerHeight,
  launchDelayMax,
  sizeColorOverrides,
  parentColorCount,
  sizeIsTextured,
}: {
  cannonConfigs: CannonConfig[];
  cannonsPositions: Position[];
  containerHeight: number;
  launchDelayMax: number;
  sizeColorOverrides: (ColorRange | null)[];
  parentColorCount: number;
  sizeIsTextured: boolean[];
}) => {
  'worklet';

  const result: (BoxBase & {
    cannonIndex: number;
  })[] = [];

  for (let cannonIndex = 0; cannonIndex < cannonConfigs.length; cannonIndex++) {
    const config = cannonConfigs[cannonIndex];
    if (!config) continue;
    const halfSpread = config.spread / 2;

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

    const cannonPos = cannonsPositions[cannonIndex];
    const baseAngle = cannonPos
      ? Math.atan2(config.target.y - cannonPos.y, config.target.x - cannonPos.x)
      : 0;

    for (let j = 0; j < config.count; j++) {
      const sizeIndex = Math.round(
        getRandomValue(
          config.sizeStart,
          config.sizeStart + config.sizeCount - 1
        )
      );
      const range = sizeColorOverrides[sizeIndex];
      const angleOffset = getRandomValue(-halfSpread, halfSpread);
      const angle = baseAngle + angleOffset;
      const speedMultiplier = getRandomValue(speedRange.min, speedRange.max);
      const depthScale = getRandomValue(depthRange.min, depthRange.max);
      const speed =
        config.speed * containerHeight * speedMultiplier * depthScale;
      result.push({
        cannonIndex,
        vx: speed * Math.cos(angle),
        vy: speed * Math.sin(angle),
        launchDelay: getRandomValue(0, launchDelayMax),
        depthScale,
        clockwise: getRandomBoolean(),
        maxRotation: {
          x: getRandomValue(xRotationRange.min, xRotationRange.max),
          z: getRandomValue(zRotationRange.min, zRotationRange.max),
        },
        colorIndex: range
          ? range.start + Math.round(getRandomValue(0, range.count - 1))
          : Math.round(getRandomValue(0, parentColorCount - 1)),
        sizeIndex,
        initialRotation: getRandomValue(0.1 * Math.PI, Math.PI),
        isTextured: sizeIsTextured[sizeIndex] ?? false,
      });
    }
  }

  return result;
};

/**
 * Computes the grid layout for confetti spawn positions.
 * Caps the total grid height to stay proportional to the container,
 * redistributing pieces into more columns when needed.
 */
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
    // Recompute column width so all columns fit within the container.
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

/**
 * Computes the angle-averaged terminal velocity of a tumbling plate.
 * As the plate tumbles, drag varies between Cn (broadside) and Ct (edge-on).
 * The time-averaged effective drag coefficient is (Cn + Ct) · 4/(3π).
 */
const tumblingTerminalVelocity = (scaledGravity: number): number => {
  const Cn = 4.0 / scaledGravity;
  const Ct = Cn * DEFAULT_TANGENTIAL_DRAG_RATIO;
  const angleAvgDrag = (Cn + Ct) * (4 / (3 * Math.PI));
  return Math.sqrt(scaledGravity / angleAvgDrag);
};

/**
 * Exact fall time under quadratic drag (F = −C·v²) starting from rest.
 *
 * Closed-form solution of  y(t) = (vT²/g) · ln(cosh(g·t/vT)):
 *   t = (vT / g) · acosh(exp(g·d / vT²))
 *
 * Unlike the naïve d/vT estimate, this accounts for the acceleration
 * phase where the piece is slower than terminal velocity — a correction
 * that matters most for small containers.
 *
 * For large g·d/vT² (> 20) the asymptotic form d/vT + (vT/g)·ln 2 is
 * used to avoid floating-point overflow in exp().
 */
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
  'worklet';
  const offsets = new Array(count);
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

const calculateGridSpawnPosition = (
  i: number,
  columnsNum: number,
  rowsNum: number,
  count: number,
  containerWidth: number,
  maxFlakeWidth: number,
  columnWidth: number
): number => {
  'worklet';
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

export const generateFallingBoxesArray = ({
  count,
  sizeVariations,
  sizeColorOverrides,
  parentColorCount,
  sizeIsTextured,
  containerWidth,
  containerHeight,
  verticalSpacing,
  maxFlakeWidth,
  maxFlakeHeight,
  verticalOffset,
  columnsNum,
  columnWidth,
  rowsNum,
  rotation,
  depth,
  wobble,
  totalTime,
  gravity,
  infinite,
  continuous,
}: {
  count: number;
  sizeVariations: number;
  sizeColorOverrides: (ColorRange | null)[];
  parentColorCount: number;
  sizeIsTextured: boolean[];
  containerWidth: number;
  containerHeight: number;
  verticalSpacing: number;
  maxFlakeWidth: number;
  maxFlakeHeight: number;
  verticalOffset: number;
  columnsNum: number;
  columnWidth: number;
  rowsNum: number;
  rotation?: Rotation;
  depth?: Range;
  wobble?: Range;
  totalTime: number;
  gravity: number;
  infinite?: boolean;
  continuous?: boolean;
}) => {
  'worklet';

  const xRotationRange = resolveRange(rotation?.x, DEFAULT_CONFETTI_ROTATION.x);
  const zRotationRange = resolveRange(rotation?.z, DEFAULT_CONFETTI_ROTATION.z);
  const depthRange = resolveRange(depth, DEFAULT_CONFETTI_DEPTH);
  const wobbleRange = resolveRange(wobble, DEFAULT_CONFETTI_WOBBLE);

  const scaledGravity = gravity * containerHeight;
  const Cn = 4.0 / scaledGravity;
  const Ct = Cn * DEFAULT_TANGENTIAL_DRAG_RATIO;

  // Approximate terminal velocity for angle-averaged tumbling plate
  const CAvg = ((Cn + Ct) * 4) / (3 * Math.PI);
  const vTermApprox = Math.sqrt(scaledGravity / CAvg);

  const rowHeight = Math.min(maxFlakeHeight, 20) + verticalSpacing;

  const samplesPerPiece = TRAJECTORY_SAMPLE_COUNT;
  const stridePerPiece = (samplesPerPiece + 1) * 3;
  const trajectories: number[] = new Array(count * stridePerPiece);
  const boxes: FallingBox[] = new Array(count);

  // Pre-compute stratified phase offsets and shuffle (Fisher-Yates) to
  // break the correlation between grid index and temporal phase.
  // Without this, sequential grid positions get sequential offsets → diagonal banding.
  const phaseOffsets = continuous ? generatePhaseOffsets(count) : [];

  for (let i = 0; i < count; i++) {
    // Grid position (same layout logic as before)
    const rowIndex = Math.floor(i / columnsNum);
    const spawnX = calculateGridSpawnPosition(
      i,
      columnsNum,
      rowsNum,
      count,
      containerWidth,
      maxFlakeWidth,
      columnWidth
    );

    const yJitter = getRandomValue(-verticalSpacing / 2, verticalSpacing / 2);
    const spawnY = rowIndex * rowHeight + verticalOffset + yJitter;

    const depthScale = getRandomValue(depthRange.min, depthRange.max);
    const clockwise = getRandomBoolean();
    const spinRate =
      getRandomValue(zRotationRange.min, zRotationRange.max) / totalTime;

    // ODE parameters per piece (depth only affects visual size, not physics)
    const effectiveGravity = scaledGravity;
    // Scale wobble into coupling strength — modulates tumble speed
    const Ccouple =
      (getRandomValue(wobbleRange.min, wobbleRange.max) * 5) / scaledGravity;
    const Crot = DEFAULT_ROTATIONAL_DAMPING;
    // Minimum tumbleRate so tumbleBias always dominates coupling torque.
    // Stall condition: tumbleBias < Ccouple * vn * vt (peak at ~v_term²)
    // tumbleBias = Crot * tumbleRate² → tumbleRate > sqrt(Ccouple * vTerm² / (2 * Crot))
    // 1.2x safety margin ensures robust tumbling even at peak coupling.
    const minTumbleRate =
      Math.sqrt((Ccouple * vTermApprox * vTermApprox) / (2 * Crot)) * 1.2;
    const tumbleRate = Math.max(
      getRandomValue(xRotationRange.min, xRotationRange.max) / totalTime,
      minTumbleRate
    );
    // Randomize tumble direction so lateral drift is balanced (half left, half right)
    const tumbleDir = clockwise ? 1 : -1;
    // Constant torque bias: ensures continuous tumbling (prevents settling at edge-on).
    // At equilibrium: tumbleBias = Crot * omega², so omega_eq = tumbleRate.
    const tumbleBias = tumbleDir * tumbleRate * tumbleRate * Crot;

    // In infinite/continuous mode, start at terminal velocity so successive
    // cycles match the outgoing batch's speed with no visible seam.
    const initialVy = infinite
      ? vTermApprox * getRandomValue(0.95, 1.05)
      : getRandomValue(0, 0.4) * scaledGravity;

    // Random initial horizontal velocity so pieces scatter laterally from the start
    const initialVx = getRandomValue(-0.15, 0.15) * scaledGravity;

    // Integrate ODE trajectory — writes directly into the shared flat array
    integrateTrajectory(
      spawnX,
      spawnY,
      initialVx,
      initialVy,
      getRandomValue(0, 2 * Math.PI),
      tumbleDir * tumbleRate,
      { Cn, Ct, Ccouple, Crot, tumbleBias, g: effectiveGravity },
      totalTime,
      samplesPerPiece,
      trajectories,
      i * stridePerPiece
    );

    const sizeIndex = Math.round(getRandomValue(0, sizeVariations - 1));
    const range = sizeColorOverrides[sizeIndex];
    boxes[i] = {
      spawnX,
      spawnY,
      depthScale,
      clockwise,
      colorIndex: range
        ? range.start + Math.round(getRandomValue(0, range.count - 1))
        : Math.round(getRandomValue(0, parentColorCount - 1)),
      sizeIndex,
      spinPhase: getRandomValue(0, 2 * Math.PI),
      spinRate,
      phaseOffset: (continuous ? phaseOffsets[i] : 0) ?? 0,
      isTextured: sizeIsTextured[sizeIndex] ?? false,
    };
  }

  return { boxes, trajectories };
};
