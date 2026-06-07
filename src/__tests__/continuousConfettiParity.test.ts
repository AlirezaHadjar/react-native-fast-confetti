import { describe, expect, it } from '@jest/globals';

import {
  DEFAULT_COLORS,
  DEFAULT_CONFETTI_GRAVITY,
  DEFAULT_CONFETTI_WOBBLE,
} from '../constants';
import {
  buildAtlasColors,
  parseFlakeChildren,
} from '../hooks/useConfettiFlakes';
import { toRuntimeInputs } from '../webgpu/resourcePacking';
import {
  computeSpawnGrid,
  estimateFallingDuration,
  generateSpawnsArray,
} from '../webgpu/utils';

const CONTAINER = {
  width: 393,
  height: 852,
};

const COUNT = 64;
const VERTICAL_SPACING = 200;

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

const expectPhaseOffsetsAreStratified = (phaseOffsets: number[]) => {
  const sorted = [...phaseOffsets].sort((a, b) => a - b);
  for (let index = 0; index < sorted.length; index++) {
    expect(sorted[index]!).toBeGreaterThanOrEqual(index / sorted.length);
    expect(sorted[index]!).toBeLessThanOrEqual(
      (index + 1) / sorted.length
    );
  }
};

const createContinuousSpawns = (seed: number) => {
  const sizeVariations = parseFlakeChildren(undefined, 'glossy');
  const {
    colorOverrides,
    parentColorCount,
  } = buildAtlasColors(sizeVariations, DEFAULT_COLORS);
  const maxFlakeWidth = Math.max(...sizeVariations.map((s) => s.width));
  const maxFlakeHeight = Math.max(...sizeVariations.map((s) => s.height));
  const grid = computeSpawnGrid({
    count: COUNT,
    containerHeight: CONTAINER.height,
    containerWidth: CONTAINER.width,
    maxFlakeHeight,
    maxFlakeWidth,
    verticalSpacing: VERTICAL_SPACING,
  });
  const duration = estimateFallingDuration({
    containerHeight: CONTAINER.height,
    gravity: DEFAULT_CONFETTI_GRAVITY,
    maxWobble: DEFAULT_CONFETTI_WOBBLE.max,
    verticalOffset: grid.verticalOffset,
  });

  return {
    cycleDurationSeconds: duration / 1000,
    spawns: withSeededRandom(seed, () =>
      generateSpawnsArray({
        count: COUNT,
        sizeVariations: sizeVariations.length,
        sizeColorOverrides: colorOverrides,
        parentColorCount,
        sizeFlagsByIndex: [1],
        containerWidth: CONTAINER.width,
        containerHeight: CONTAINER.height,
        verticalSpacing: VERTICAL_SPACING,
        maxFlakeWidth,
        maxFlakeHeight,
        verticalOffset: grid.verticalOffset,
        columnsNum: grid.columnsNum,
        columnWidth: grid.columnWidth,
        rowsNum: grid.rowsNum,
        totalTime: duration / 1000,
        gravity: DEFAULT_CONFETTI_GRAVITY,
        infinite: true,
        continuous: true,
      })
    ),
  };
};

describe('continuous GPU confetti parity framework', () => {
  it('keeps phase offsets stratified for continuous rain', () => {
    const { spawns } = createContinuousSpawns(0xabc123);

    expect(spawns).toHaveLength(COUNT);
    expectPhaseOffsetsAreStratified(
      spawns.map((spawn) => spawn.meta[3])
    );
  });

  it('reseeds phase offsets and runtime life on restart', () => {
    const first = createContinuousSpawns(0xabc123);
    const sameSeed = createContinuousSpawns(0xabc123);
    const restarted = createContinuousSpawns(0xdef456);

    expect(first.spawns.map((spawn) => spawn.meta[3])).toEqual(
      sameSeed.spawns.map((spawn) => spawn.meta[3])
    );
    expect(first.spawns.map((spawn) => spawn.meta[3])).not.toEqual(
      restarted.spawns.map((spawn) => spawn.meta[3])
    );

    const runtimeInputs = toRuntimeInputs(
      restarted.spawns,
      restarted.cycleDurationSeconds
    );
    for (let index = 0; index < runtimeInputs.length; index++) {
      expect(runtimeInputs[index]!.life).toBeCloseTo(
        -restarted.spawns[index]!.meta[3] * restarted.cycleDurationSeconds,
        5
      );
    }
  });
});
