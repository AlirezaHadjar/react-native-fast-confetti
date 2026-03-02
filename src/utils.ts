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
} from './constants';
import { Extrapolation, interpolate } from 'react-native-reanimated';
import type { NamedPosition, Position, RandomOffset, Range, Rotation } from './types';

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

const resolveRange = (
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
    initialRotation: getRandomValue(0.1 * Math.PI, Math.PI),
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
