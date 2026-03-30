import {
  DEFAULT_CONFETTI_ROTATION,
  DEFAULT_CANNON_CONFETTI_ROTATION,
  DEFAULT_CANNON_CONFETTI_SPEED_VARIATION,
  DEFAULT_CANNON_CONFETTI_DEPTH,
  DEFAULT_CANNON_CONFETTI_LAUNCH_DELAY_MAX,
  DEFAULT_CONFETTI_DEPTH,
  DEFAULT_CONFETTI_WOBBLE,
  TRAJECTORY_SAMPLE_COUNT,
  DEFAULT_TANGENTIAL_DRAG_RATIO,
  DEFAULT_ROTATIONAL_DAMPING,
  DEFAULT_PI_CONFETTI_ROTATION,
  DEFAULT_PI_CONFETTI_SPEED_VARIATION,
  DEFAULT_PI_CONFETTI_DEPTH,
  DEFAULT_PI_CONFETTI_LAUNCH_DELAY_MAX,
} from './constants';
import { integrateTrajectory } from './physics';
import type { FallingBox, NamedPosition, Position, Range, Rotation } from './types';
import type { ColorRange } from './hooks/useConfettiFlakes';

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

export const generatePIBoxesArray = ({
  count,
  sizeVariations,
  sizeColorOverrides,
  parentColorCount,
  sizeIsTextured,
  spread,
  rotation,
  speedVariation,
  depth,
  launchDelayMax,
}: {
  count: number;
  sizeVariations: number;
  sizeColorOverrides: (ColorRange | null)[];
  parentColorCount: number;
  sizeIsTextured: boolean[];
  spread: number;
  rotation?: Rotation;
  speedVariation?: Range;
  depth?: Range;
  launchDelayMax: number;
}) => {
  'worklet';

  const xRotationRange = resolveRange(
    rotation?.x,
    DEFAULT_PI_CONFETTI_ROTATION.x
  );
  const zRotationRange = resolveRange(
    rotation?.z,
    DEFAULT_PI_CONFETTI_ROTATION.z
  );
  const speedRange = resolveRange(
    speedVariation,
    DEFAULT_PI_CONFETTI_SPEED_VARIATION
  );
  const depthRange = resolveRange(depth, DEFAULT_PI_CONFETTI_DEPTH);

  const halfSpread = spread / 2;
  // Center the spread around "upward" (-PI/2)
  const baseAngle = -Math.PI / 2;

  return new Array(count).fill(0).map((_, i) => {
    // Golden angle distribution mapped to spread range
    const goldenAngle =
      baseAngle + ((((i * 137.5) % 360) * Math.PI) / 180 - Math.PI) * (halfSpread / Math.PI);

    const sizeIndex = Math.round(getRandomValue(0, sizeVariations - 1));
    const range = sizeColorOverrides[sizeIndex];
    return {
      angle: goldenAngle,
      cosAngle: Math.cos(goldenAngle),
      sinAngle: Math.sin(goldenAngle),
      speedMultiplier: getRandomValue(speedRange.min, speedRange.max),
      launchDelay: getRandomValue(0, launchDelayMax),
      depthScale: getRandomValue(depthRange.min, depthRange.max),
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
    };
  });
};

export const estimatePIDuration = ({
  initialSpeed,
  gravity,
  vDrag,
  depth,
  speedVariation,
  sprayDurationMs,
  containerHeight,
  blastY,
}: {
  initialSpeed: number;
  gravity: number;
  vDrag: number;
  depth?: Range;
  speedVariation?: Range;
  sprayDurationMs?: number;
  containerHeight: number;
  blastY: number;
}): number => {
  // Terminal velocity under drag: v_term = g/drag (in normalized units)
  // Time for the slowest piece (launched straight up at max speed) to:
  //   1. Decelerate to zero  2. Fall back to launch height  3. Continue falling to screen bottom
  const safeDrag = Math.max(vDrag, 0.001);
  const scaledGravity = Math.max(gravity * containerHeight, 0.001);
  const terminalVelocity = scaledGravity / safeDrag;

  // Worst-case: piece launched straight up at max speed
  const depthMax = depth?.max ?? DEFAULT_PI_CONFETTI_DEPTH.max;
  const maxSpeedVar =
    speedVariation?.max ?? DEFAULT_PI_CONFETTI_SPEED_VARIATION.max;
  const maxSpeed = initialSpeed * maxSpeedVar * depthMax * containerHeight;

  // Time to reach apex (velocity = 0) for upward launch: v(t) = (vy - g/drag) * e^(-drag*t) + g/drag = 0
  // For upward launch, vy is negative (upward), so time to apex:
  const vy = -maxSpeed; // upward
  const apexTime = Math.log(1 - vy * safeDrag / scaledGravity) / safeDrag;

  // Height at apex: y(t) = blastY + (g/drag)*t + ((vy - g/drag)/drag) * (1 - e^(-drag*t))
  const expAtApex = 1 - Math.exp(-safeDrag * apexTime);
  const apexY =
    blastY +
    (scaledGravity / safeDrag) * apexTime +
    ((vy - scaledGravity / safeDrag) / safeDrag) * expAtApex;

  // Remaining fall distance from apex to bottom of screen
  const remainingFall = containerHeight - apexY;

  // Time to fall remaining distance at ~terminal velocity (conservative)
  const fallTime = remainingFall > 0 ? remainingFall / terminalVelocity : 0;

  const totalTimeSec = (apexTime + fallTime) * 1.2; // 20% safety margin

  if (sprayDurationMs !== undefined) {
    return Math.ceil(totalTimeSec * 1000 + sprayDurationMs);
  }
  return Math.ceil(
    (totalTimeSec * 1000) / (1 - DEFAULT_PI_CONFETTI_LAUNCH_DELAY_MAX)
  );
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
  center: (w, h) => ({ x: w / 2, y: h / 2 }),
};

export const resolveNamedPosition = (
  position: NamedPosition | Position,
  containerWidth: number,
  containerHeight: number
): Position => {
  if (typeof position === 'object') return position;
  return POSITION_RESOLVERS[position](containerWidth, containerHeight, EDGE_OFFSET);
};

export type CannonConfig = {
  spread: number;
  speed: number;
  count: number;
  speedVariation: Required<Range>;
  colorStart: number;
  colorCount: number;
  sizeStart: number;
  sizeCount: number;
  rotation?: Rotation;
  depth?: Range;
  target: Position;
};

export const estimateCannonDuration = ({
  cannonConfigs,
  gravity,
  drag,
  sprayDurationMs,
}: {
  cannonConfigs: CannonConfig[];
  gravity: number;
  drag: number;
  sprayDurationMs?: number;
}): number => {
  // Find the maximum normalized speed across all origins
  let maxNormalizedSpeed = 0;
  for (const config of cannonConfigs) {
    const depthMax = config.depth?.max ?? DEFAULT_CANNON_CONFETTI_DEPTH.max;
    const maxSpeed = config.speed * config.speedVariation.max * depthMax;
    maxNormalizedSpeed = Math.max(maxNormalizedSpeed, maxSpeed);
  }

  // Asymptotic time for the fastest upward particle to return to origin height
  // With 20% safety margin
  const safeDrag = Math.max(drag, 0.001);
  const safeGravity = Math.max(gravity, 0.001);
  const physicsTimeSec = (1 / safeDrag + maxNormalizedSpeed / safeGravity) * 1.2;

  // Add spray stagger time (absolute ms) or default 20% overhead
  if (sprayDurationMs !== undefined) {
    return Math.ceil(physicsTimeSec * 1000 + sprayDurationMs);
  }
  return Math.ceil(
    (physicsTimeSec * 1000) / (1 - DEFAULT_CANNON_CONFETTI_LAUNCH_DELAY_MAX)
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

  const result: {
    cannonIndex: number;
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
  }[] = [];

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
      const speed = config.speed * containerHeight * speedMultiplier * depthScale;
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
  // Angle-averaged terminal velocity: as the piece tumbles, drag varies between
  // Cn (broadside) and Ct (edge-on). The time-averaged effective drag coefficient
  // is (Cn + Ct) * 4/(3π), giving a faster average fall than broadside-only.
  const scaledGravity = Math.max(gravity * containerHeight, 0.001);
  const Cn = 4.0 / scaledGravity;
  const Ct = Cn * DEFAULT_TANGENTIAL_DRAG_RATIO;
  const angleAvgDrag = (Cn + Ct) * (4 / (3 * Math.PI));
  const terminalVelocity = Math.sqrt(scaledGravity / angleAvgDrag);
  const totalFallDistance = containerHeight + Math.abs(verticalOffset);
  const timeSec = totalFallDistance / terminalVelocity;
  const wobbleMargin = 1.1 + (maxWobble ?? 1.5) * 0.2;
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
  columnWidth: number,
): number => {
  'worklet';
  const rowIndex = Math.floor(i / columnsNum);
  const isLastRow = rowIndex === rowsNum - 1;
  if (isLastRow) {
    const itemsInLastRow = count - (rowsNum - 1) * columnsNum;
    const lastRowSpacing = (containerWidth - itemsInLastRow * maxFlakeWidth) / (itemsInLastRow + 1);
    const positionInLastRow = i - (rowsNum - 1) * columnsNum;
    return lastRowSpacing + positionInLastRow * (maxFlakeWidth + lastRowSpacing);
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
  const CAvg = (Cn + Ct) * 4 / (3 * Math.PI);
  const vTermApprox = Math.sqrt(scaledGravity / CAvg);

  const columnWidth =
    Math.min(maxFlakeWidth, 20) +
    Math.max(0, containerWidth / count - maxFlakeWidth);

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
      i, columnsNum, rowsNum, count, containerWidth, maxFlakeWidth, columnWidth
    );

    const yJitter = getRandomValue(-verticalSpacing / 2, verticalSpacing / 2);
    const spawnY = rowIndex * rowHeight + verticalOffset + yJitter;

    const depthScale = getRandomValue(depthRange.min, depthRange.max);
    const clockwise = getRandomBoolean();
    const spinRate = getRandomValue(zRotationRange.min, zRotationRange.max) / totalTime;

    // ODE parameters per piece (depth only affects visual size, not physics)
    const effectiveGravity = scaledGravity;
    // Scale wobble into coupling strength — modulates tumble speed
    const Ccouple = (getRandomValue(wobbleRange.min, wobbleRange.max) * 5) / scaledGravity;
    const Crot = DEFAULT_ROTATIONAL_DAMPING;
    // Minimum tumbleRate so tumbleBias always dominates coupling torque.
    // Stall condition: tumbleBias < Ccouple * vn * vt (peak at ~v_term²)
    // tumbleBias = Crot * tumbleRate² → tumbleRate > sqrt(Ccouple * vTerm² / (2 * Crot))
    // 1.2x safety margin ensures robust tumbling even at peak coupling.
    const minTumbleRate = Math.sqrt(
      (Ccouple * vTermApprox * vTermApprox) / (2 * Crot)
    ) * 1.2;
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
      spawnX, spawnY, initialVx, initialVy,
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
