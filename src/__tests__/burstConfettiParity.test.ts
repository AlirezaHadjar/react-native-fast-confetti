import { describe, expect, it } from '@jest/globals';
import { d } from 'typegpu';

import {
  DEFAULT_CANNON_CONFETTI_GRAVITY,
  DEFAULT_COLORS,
  DEFAULT_PI_CONFETTI_GRAVITY,
} from '../constants';
import {
  buildAtlasColors,
  parseFlakeChildren,
} from '../hooks/useConfettiFlakes';
import {
  toCannonBurstParticles,
  toPIBurstParticles,
  toBurstSizeInputs,
} from '../webgpu/burstResourcePacking';
import {
  BURST_PARTICLE_BYTES,
  BURST_SIZE_META_BYTES,
  BURST_UNIFORMS_BYTES,
  BurstParticleSchema,
  BurstSizeSchema,
  BurstUniformsSchema,
} from '../webgpu/shaders/burstConfetti';
import {
  estimateCannonDuration,
  estimatePIDuration,
  generateCannonBoxesArray,
  generatePIBoxesArray,
  resolveNamedPosition,
  type CannonConfig,
  type PIConfig,
} from '../utils';

const CONTAINER = {
  width: 393,
  height: 852,
};

const withSeededRandom = <T>(seed: number, fn: () => T): T => {
  const random = Math.random;
  let state = seed >>> 0;

  Math.random = () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x100000000;
  };

  try {
    return fn();
  } finally {
    Math.random = random;
  }
};

const expectCloseTuple = (
  actual: readonly number[],
  expected: readonly number[]
) => {
  expect(actual).toHaveLength(expected.length);
  for (let index = 0; index < expected.length; index++) {
    expect(actual[index]).toBeCloseTo(expected[index]!, 5);
  }
};

const createAtlas = () => {
  const sizeVariations = parseFlakeChildren(undefined, 'glossy');
  return {
    sizeVariations,
    ...buildAtlasColors(sizeVariations, DEFAULT_COLORS),
  };
};

describe('burst GPU confetti parity framework', () => {
  it('maps PI origin expansion and launch data into GPU particles', () => {
    const {
      sizeVariations,
      colorOverrides,
      parentColorCount,
      sizeIsTextured,
    } = createAtlas();
    const blastPositions = [
      { x: CONTAINER.width / 2, y: 450 },
      { x: CONTAINER.width / 2, y: 150 },
    ];
    const originDelays = [0, 300];
    const piConfigs: PIConfig[] = [
      {
        spread: Math.PI,
        initialSpeed: 1.25,
        count: 12,
        speedVariation: { min: 0.8, max: 0.8 },
        colorStart: 0,
        colorCount: DEFAULT_COLORS.length,
        sizeStart: 0,
        sizeCount: sizeVariations.length,
        rotation: {
          x: { min: Math.PI, max: Math.PI },
          z: { min: Math.PI * 2, max: Math.PI * 2 },
        },
        depth: { min: 1.05, max: 1.05 },
      },
      {
        spread: Math.PI / 2,
        initialSpeed: 1,
        count: 8,
        speedVariation: { min: 1, max: 1 },
        colorStart: 0,
        colorCount: DEFAULT_COLORS.length,
        sizeStart: 0,
        sizeCount: sizeVariations.length,
        depth: { min: 1, max: 1 },
      },
    ];

    const { flightDuration, totalDuration } = estimatePIDuration({
      piConfigs,
      blastPositions,
      originDelays,
      gravity: DEFAULT_PI_CONFETTI_GRAVITY,
      vDrag: 3,
      sprayDurationMs: 250,
      containerHeight: CONTAINER.height,
    });
    const launchDelayMax = Math.min(250 / totalDuration, 1);
    const boxes = withSeededRandom(0x31415926, () =>
      generatePIBoxesArray({
        piConfigs,
        originDelays,
        containerHeight: CONTAINER.height,
        launchDelayMax,
        sizeColorOverrides: colorOverrides,
        parentColorCount,
        sizeIsTextured,
      })
    );
    const particles = toPIBurstParticles(boxes, blastPositions);

    expect(flightDuration).toBeGreaterThan(0);
    expect(totalDuration).toBe(flightDuration + 300);
    expect(boxes).toHaveLength(20);
    expect(particles).toHaveLength(boxes.length);

    for (let index = 0; index < boxes.length; index++) {
      const box = boxes[index]!;
      const particle = particles[index]!;
      const origin = blastPositions[box.originIndex]!;

      expectCloseTuple(particle.originAndTiming, [
        origin.x,
        origin.y,
        box.originDelay,
        box.launchDelay,
      ]);
      expectCloseTuple(particle.velocityAndDepth, [
        box.vx,
        box.vy,
        box.depthScale,
        box.initialRotation,
      ]);
      expectCloseTuple(particle.rotationAndMeta, [
        box.maxRotation.x,
        box.maxRotation.z,
        box.clockwise ? 1 : -1,
        0,
      ]);
      expectCloseTuple(particle.indices, [
        box.sizeIndex,
        box.colorIndex,
        box.isTextured ? 1 : 0,
        box.speedMultiplier,
      ]);
    }
  });

  it('maps Cannon named positions, targets, and velocities into GPU particles', () => {
    const {
      sizeVariations,
      colorOverrides,
      parentColorCount,
      sizeIsTextured,
    } = createAtlas();
    const cannonsPositions = [
      resolveNamedPosition('bottom-left', CONTAINER.width, CONTAINER.height),
      resolveNamedPosition('bottom-right', CONTAINER.width, CONTAINER.height),
    ];
    const centerTarget = resolveNamedPosition(
      'center',
      CONTAINER.width,
      CONTAINER.height
    );
    const cannonConfigs: CannonConfig[] = [
      {
        spread: 0,
        speed: 2,
        count: 10,
        speedVariation: { min: 1, max: 1 },
        colorStart: 0,
        colorCount: DEFAULT_COLORS.length,
        sizeStart: 0,
        sizeCount: sizeVariations.length,
        depth: { min: 1, max: 1 },
        target: centerTarget,
      },
      {
        spread: 0,
        speed: 1.5,
        count: 10,
        speedVariation: { min: 1, max: 1 },
        colorStart: 0,
        colorCount: DEFAULT_COLORS.length,
        sizeStart: 0,
        sizeCount: sizeVariations.length,
        depth: { min: 1.1, max: 1.1 },
        target: centerTarget,
      },
    ];
    const duration = estimateCannonDuration({
      cannonConfigs,
      cannonsPositions,
      gravity: DEFAULT_CANNON_CONFETTI_GRAVITY,
      drag: 3,
      sprayDurationMs: 300,
      containerHeight: CONTAINER.height,
    });
    const launchDelayMax = Math.min(300 / duration, 1);
    const boxes = withSeededRandom(0xc0ffee, () =>
      generateCannonBoxesArray({
        cannonConfigs,
        cannonsPositions,
        containerHeight: CONTAINER.height,
        launchDelayMax,
        sizeColorOverrides: colorOverrides,
        parentColorCount,
        sizeIsTextured,
      })
    );
    const particles = toCannonBurstParticles(boxes, cannonsPositions);

    expect(cannonsPositions[0]).toEqual({ x: -30, y: CONTAINER.height + 30 });
    expect(cannonsPositions[1]).toEqual({
      x: CONTAINER.width + 30,
      y: CONTAINER.height + 30,
    });
    expect(duration).toBeGreaterThan(0);
    expect(boxes).toHaveLength(20);
    expect(particles).toHaveLength(boxes.length);

    for (let index = 0; index < boxes.length; index++) {
      const box = boxes[index]!;
      const particle = particles[index]!;
      const origin = cannonsPositions[box.cannonIndex]!;
      const config = cannonConfigs[box.cannonIndex]!;
      const speed = Math.hypot(box.vx, box.vy);

      expect(speed).toBeCloseTo(
        config.speed * CONTAINER.height * config.depth!.min,
        5
      );
      expectCloseTuple(particle.originAndTiming, [
        origin.x,
        origin.y,
        0,
        box.launchDelay,
      ]);
      expectCloseTuple(particle.velocityAndDepth, [
        box.vx,
        box.vy,
        box.depthScale,
        box.initialRotation,
      ]);
      expectCloseTuple(particle.rotationAndMeta, [
        box.maxRotation.x,
        box.maxRotation.z,
        box.clockwise ? 1 : -1,
        1,
      ]);
      expectCloseTuple(particle.indices, [
        box.sizeIndex,
        box.colorIndex,
        box.isTextured ? 1 : 0,
        box.cannonIndex,
      ]);
    }
  });

  it('maps burst host data to TypeGPU schemas', () => {
    const { sizeVariations } = createAtlas();
    const sizeInputs = toBurstSizeInputs(sizeVariations);

    expect(BURST_PARTICLE_BYTES).toBe(d.sizeOf(BurstParticleSchema));
    expect(BURST_SIZE_META_BYTES).toBe(d.sizeOf(BurstSizeSchema));
    expect(BURST_UNIFORMS_BYTES).toBe(d.sizeOf(BurstUniformsSchema));
    expect(BURST_PARTICLE_BYTES).toBe(64);
    expect(BURST_SIZE_META_BYTES).toBe(16);
    expect(sizeInputs[0]!.dims[0]).toBe(sizeVariations[0]!.width);
    expect(sizeInputs[0]!.dims[1]).toBe(sizeVariations[0]!.height);
    expect(sizeInputs[0]!.dims[3]).toBe(1);
  });
});
