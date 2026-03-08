import { vec, type SkImage, type SkSVG } from '@shopify/react-native-skia';
import {
  RANDOM_INITIAL_Y_JIGGLE,
  DEFAULT_CONFETTI_ROTATION,
  DEFAULT_PICONFETTI_ROTATION,
  DEFAULT_CONFETTI_RANDOM_SPEED,
  DEFAULT_CONFETTI_RANDOM_OFFSET,
  DEFAULT_PICONFETTI_RANDOM_OFFSET,
  DEFAULT_PICONFETTI_RANDOM_SPEED,
  DEFAULT_CANNON_CONFETTI_ROTATION,
  DEFAULT_CANNON_CONFETTI_SPEED_VARIATION,
  DEFAULT_CANNON_CONFETTI_DEPTH,
  DEFAULT_CANNON_CONFETTI_LAUNCH_DELAY_MAX,
  DEFAULT_CONFETTI_DEPTH,
  DEFAULT_CONFETTI_FLUTTER,
  TRAJECTORY_SAMPLE_COUNT,
  DEFAULT_TANGENTIAL_DRAG_RATIO,
  DEFAULT_ROTATIONAL_DAMPING,
} from './constants';
import { integrateTrajectory } from './physics';
import { Extrapolation, interpolate } from 'react-native-reanimated';
import type { FallingBox, NamedPosition, Position, RandomOffset, Range, Rotation } from './types';

export const getRandomBoolean = () => {
  'worklet';
  return Math.random() >= 0.5;
};

export const getRandomValue = (min: number, max: number): number => {
  'worklet';
  if (min === max) return min;
  return Math.random() * (max - min) + min;
};

export const randomColor = (colors: string[]): string => {
  'worklet';
  return colors[Math.floor(Math.random() * colors.length)] as string;
};

export const randomXArray = (num: number, min: number, max: number) => {
  'worklet';
  return new Array(num).fill(0).map(() => getRandomValue(min, max));
};

export const generateEvenlyDistributedValues = (
  lowerBound: number,
  upperBound: number,
  chunks: number
) => {
  'worklet';
  const step = (upperBound - lowerBound) / (chunks - 1);
  return Array.from({ length: chunks }, (_, i) => lowerBound + step * i);
};

export const resolveRange = (
  range?: { min?: number; max?: number },
  defaultRange?: { min: number; max: number }
) => {
  'worklet';
  const finalMin = range?.min ?? defaultRange?.min ?? 0;
  const finalMax = range?.max ?? defaultRange?.max ?? 0;
  return { min: finalMin, max: finalMax };
};

export const generateBoxesArray = ({
  colorsVariations,
  count,
  duration,
  sizeVariations,
  rotation,
  randomSpeed,
  randomOffset,
}: {
  count: number;
  colorsVariations: number;
  sizeVariations: number;
  duration: number;
  rotation?: Rotation;
  randomSpeed?: Range;
  randomOffset?: RandomOffset;
}) => {
  'worklet';

  rotation = rotation ?? DEFAULT_CONFETTI_ROTATION;
  randomSpeed = randomSpeed ?? DEFAULT_CONFETTI_RANDOM_SPEED;
  randomOffset = randomOffset ?? DEFAULT_CONFETTI_RANDOM_OFFSET;

  const xRotationRange = resolveRange(rotation.x, DEFAULT_CONFETTI_ROTATION.x);
  const zRotationRange = resolveRange(rotation.z, DEFAULT_CONFETTI_ROTATION.z);
  const randomSpeedRange = resolveRange(
    randomSpeed,
    DEFAULT_CONFETTI_RANDOM_SPEED
  );
  const randomXOffsetRange = resolveRange(
    randomOffset.x,
    DEFAULT_CONFETTI_RANDOM_OFFSET.x
  );
  const randomYOffsetRange = resolveRange(
    randomOffset.y,
    DEFAULT_CONFETTI_RANDOM_OFFSET.y
  );

  const maxRandomX = interpolate(
    duration,
    [0, 8000],
    [5, 50],
    Extrapolation.CLAMP
  );

  return new Array(count).fill(0).map(() => ({
    clockwise: getRandomBoolean(),
    maxRotation: {
      x: getRandomValue(xRotationRange.min, xRotationRange.max),
      z: getRandomValue(zRotationRange.min, zRotationRange.max),
    },
    colorIndex: Math.round(getRandomValue(0, colorsVariations - 1)),
    sizeIndex: Math.round(getRandomValue(0, sizeVariations - 1)),
    randomXs: randomXArray(5, -maxRandomX, maxRandomX), // Array of randomX values for horizontal movement
    initialRandomY: getRandomValue(
      -RANDOM_INITIAL_Y_JIGGLE,
      RANDOM_INITIAL_Y_JIGGLE
    ),
    blastThreshold: getRandomValue(0, 0.9),
    randomSpeed: getRandomValue(randomSpeedRange.min, randomSpeedRange.max), // Random speed multiplier
    randomOffsetX: getRandomValue(
      randomXOffsetRange.min,
      randomXOffsetRange.max
    ), // Random X offset for initial position
    randomOffsetY: getRandomValue(
      randomYOffsetRange.min,
      randomYOffsetRange.max
    ), // Random Y offset for initial position
  }));
};

export const generatePIBoxesArray = ({
  count,
  colorsVariations,
  sizeVariations,
  rotation,
  randomSpeed,
  randomOffset,
}: {
  count: number;
  colorsVariations: number;
  sizeVariations: number;
  rotation?: Rotation;
  randomSpeed?: Range;
  randomOffset?: RandomOffset;
}) => {
  'worklet';

  rotation = rotation ?? DEFAULT_PICONFETTI_ROTATION;
  randomSpeed = randomSpeed ?? DEFAULT_PICONFETTI_RANDOM_SPEED;
  randomOffset = randomOffset ?? DEFAULT_PICONFETTI_RANDOM_OFFSET;

  const xRotationRange = resolveRange(
    rotation.x,
    DEFAULT_PICONFETTI_ROTATION.x
  );
  const zRotationRange = resolveRange(
    rotation.z,
    DEFAULT_PICONFETTI_ROTATION.z
  );
  const randomSpeedRange = resolveRange(
    randomSpeed,
    DEFAULT_PICONFETTI_RANDOM_SPEED
  );
  const randomXOffsetRange = resolveRange(
    randomOffset.x,
    DEFAULT_PICONFETTI_RANDOM_OFFSET.x
  );
  const randomYOffsetRange = resolveRange(
    randomOffset.y,
    DEFAULT_PICONFETTI_RANDOM_OFFSET.y
  );

  return new Array(count).fill(0).map(() => ({
    clockwise: getRandomBoolean(),
    maxRotation: {
      x: getRandomValue(xRotationRange.min, xRotationRange.max),
      z: getRandomValue(zRotationRange.min, zRotationRange.max),
    },
    colorIndex: Math.round(getRandomValue(0, colorsVariations - 1)),
    sizeIndex: Math.round(getRandomValue(0, sizeVariations - 1)),
    randomXs: randomXArray(6, -5, 5), // Array of randomX values for horizontal movement
    initialRandomY: getRandomValue(
      -RANDOM_INITIAL_Y_JIGGLE,
      RANDOM_INITIAL_Y_JIGGLE
    ),
    initialRotation: getRandomValue(0.1 * Math.PI, Math.PI),
    randomSpeed: getRandomValue(randomSpeedRange.min, randomSpeedRange.max), // Random speed multiplier
    randomOffsetX: getRandomValue(
      randomXOffsetRange.min,
      randomXOffsetRange.max
    ), // Random X offset for initial position
    randomOffsetY: getRandomValue(
      randomYOffsetRange.min,
      randomYOffsetRange.max
    ), // Random X offset for initial position
    delayBlast: getRandomValue(0, 0.6), // Random velocity multiplier
    randomAcceleration: vec(getRandomValue(0.1, 0.3), getRandomValue(0.1, 0.3)), // Random acceleration multiplier
  }));
};

export const createTextureProps = <T extends 'svg' | 'image'>(
  type: T,
  content: any
) =>
  ({ type, content }) as T extends 'svg'
    ? { type: 'svg'; content: SkSVG }
    : { type: 'image'; content: SkImage };

const EDGE_OFFSET = 30;

export const resolveNamedPosition = (
  position: NamedPosition | Position,
  containerWidth: number,
  containerHeight: number
): Position => {
  if (typeof position === 'object') return position;

  switch (position) {
    case 'bottom-left':
      return { x: -EDGE_OFFSET, y: containerHeight + EDGE_OFFSET };
    case 'bottom-right':
      return { x: containerWidth + EDGE_OFFSET, y: containerHeight + EDGE_OFFSET };
    case 'bottom-center':
      return { x: containerWidth / 2, y: containerHeight + EDGE_OFFSET };
    case 'top-left':
      return { x: -EDGE_OFFSET, y: -EDGE_OFFSET };
    case 'top-right':
      return { x: containerWidth + EDGE_OFFSET, y: -EDGE_OFFSET };
    case 'top-center':
      return { x: containerWidth / 2, y: -EDGE_OFFSET };
    case 'center-left':
      return { x: -EDGE_OFFSET, y: containerHeight / 2 };
    case 'center-right':
      return { x: containerWidth + EDGE_OFFSET, y: containerHeight / 2 };
    case 'center':
      return { x: containerWidth / 2, y: containerHeight / 2 };
  }
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
  const physicsTimeSec = (1 / drag + maxNormalizedSpeed / gravity) * 1.2;

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
  launchDelayMax,
}: {
  cannonConfigs: CannonConfig[];
  launchDelayMax: number;
}) => {
  'worklet';

  const result: {
    cannonIndex: number;
    angleOffset: number;
    speedMultiplier: number;
    cannonSpeed: number;
    launchDelay: number;
    depthScale: number;
    clockwise: boolean;
    maxRotation: { x: number; z: number };
    colorIndex: number;
    sizeIndex: number;
    initialRotation: number;
    targetX: number;
    targetY: number;
  }[] = [];

  for (let cannonIndex = 0; cannonIndex < cannonConfigs.length; cannonIndex++) {
    const config = cannonConfigs[cannonIndex]!;
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

    for (let j = 0; j < config.count; j++) {
      result.push({
        cannonIndex,
        angleOffset: getRandomValue(-halfSpread, halfSpread),
        speedMultiplier: getRandomValue(speedRange.min, speedRange.max),
        cannonSpeed: config.speed,
        launchDelay: getRandomValue(0, launchDelayMax),
        depthScale: getRandomValue(depthRange.min, depthRange.max),
        clockwise: getRandomBoolean(),
        maxRotation: {
          x: getRandomValue(xRotationRange.min, xRotationRange.max),
          z: getRandomValue(zRotationRange.min, zRotationRange.max),
        },
        colorIndex: Math.round(
          getRandomValue(
            config.colorStart,
            config.colorStart + config.colorCount - 1
          )
        ),
        sizeIndex: Math.round(
          getRandomValue(
            config.sizeStart,
            config.sizeStart + config.sizeCount - 1
          )
        ),
        initialRotation: getRandomValue(0.1 * Math.PI, Math.PI),
        targetX: config.target.x,
        targetY: config.target.y,
      });
    }
  }

  return result;
};

export const estimateFallingDuration = ({
  gravity,
  containerHeight,
  verticalOffset,
  maxFlutter,
}: {
  gravity: number;
  containerHeight: number;
  verticalOffset: number;
  maxFlutter?: number;
}): number => {
  // Angle-averaged terminal velocity: as the piece tumbles, drag varies between
  // Cn (broadside) and Ct (edge-on). The time-averaged effective drag coefficient
  // is (Cn + Ct) * 4/(3π), giving a faster average fall than broadside-only.
  const scaledGravity = gravity * containerHeight;
  const Cn = 4.0 / scaledGravity;
  const Ct = Cn * DEFAULT_TANGENTIAL_DRAG_RATIO;
  const angleAvgDrag = (Cn + Ct) * (4 / (3 * Math.PI));
  const terminalVelocity = Math.sqrt(scaledGravity / angleAvgDrag);
  const totalFallDistance = containerHeight + Math.abs(verticalOffset);
  const timeSec = totalFallDistance / terminalVelocity;
  const flutterMargin = 1.1 + (maxFlutter ?? 1.5) * 0.2;
  return Math.ceil(timeSec * 1000 * flutterMargin);
};

export const generateFallingBoxesArray = ({
  count,
  colorsVariations,
  sizeVariations,
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
  flutter,
  totalTime,
  gravity,
  infinite,
  continuous,
}: {
  count: number;
  colorsVariations: number;
  sizeVariations: number;
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
  flutter?: Range;
  totalTime: number;
  gravity: number;
  infinite?: boolean;
  continuous?: boolean;
}) => {
  'worklet';

  const xRotationRange = resolveRange(rotation?.x, DEFAULT_CONFETTI_ROTATION.x);
  const zRotationRange = resolveRange(rotation?.z, DEFAULT_CONFETTI_ROTATION.z);
  const depthRange = resolveRange(depth, DEFAULT_CONFETTI_DEPTH);
  const flutterRange = resolveRange(flutter, DEFAULT_CONFETTI_FLUTTER);

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
  const phaseOffsets: number[] = new Array(count);
  if (continuous) {
    for (let i = 0; i < count; i++) {
      phaseOffsets[i] = (i + Math.random()) / count;
    }
    for (let i = count - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = phaseOffsets[i]!;
      phaseOffsets[i] = phaseOffsets[j]!;
      phaseOffsets[j] = tmp;
    }
  }

  for (let i = 0; i < count; i++) {
    // Grid position (same layout logic as before)
    const rowIndex = Math.floor(i / columnsNum);
    const isLastRow = rowIndex === rowsNum - 1;

    let spawnX: number;
    if (isLastRow) {
      const itemsInLastRow = count - (rowsNum - 1) * columnsNum;
      const lastRowSpacing =
        (containerWidth - itemsInLastRow * maxFlakeWidth) /
        (itemsInLastRow + 1);
      const positionInLastRow = i - (rowsNum - 1) * columnsNum;
      spawnX =
        lastRowSpacing +
        positionInLastRow * (maxFlakeWidth + lastRowSpacing);
    } else {
      spawnX = (i % columnsNum) * columnWidth;
    }

    const yJitter = getRandomValue(-verticalSpacing / 2, verticalSpacing / 2);
    const spawnY = rowIndex * rowHeight + verticalOffset + yJitter;

    const depthScale = getRandomValue(depthRange.min, depthRange.max);
    const clockwise = getRandomBoolean();
    const spinRate = getRandomValue(zRotationRange.min, zRotationRange.max) / totalTime;

    // ODE parameters per piece (depth only affects visual size, not physics)
    const effectiveGravity = scaledGravity;
    // Scale flutter into coupling strength — modulates tumble speed
    const Ccouple = (getRandomValue(flutterRange.min, flutterRange.max) * 5) / scaledGravity;
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
      : getRandomValue(0, 0.15) * scaledGravity;

    // Integrate ODE trajectory — writes directly into the shared flat array
    integrateTrajectory(
      spawnX, spawnY, 0, initialVy,
      getRandomValue(0, 2 * Math.PI),
      tumbleDir * tumbleRate,
      { Cn, Ct, Ccouple, Crot, tumbleBias, g: effectiveGravity },
      totalTime,
      samplesPerPiece,
      trajectories,
      i * stridePerPiece
    );

    boxes[i] = {
      spawnX,
      spawnY,
      depthScale,
      clockwise,
      colorIndex: Math.round(getRandomValue(0, colorsVariations - 1)),
      sizeIndex: Math.round(getRandomValue(0, sizeVariations - 1)),
      spinPhase: getRandomValue(0, 2 * Math.PI),
      spinRate,
      phaseOffset: continuous ? phaseOffsets[i]! : 0,
    };
  }

  return { boxes, trajectories };
};
