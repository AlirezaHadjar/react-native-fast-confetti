import { describe, expect, it } from '@jest/globals';
import { d } from 'typegpu';

import {
  DEFAULT_COLORS,
  DEFAULT_CONFETTI_GRAVITY,
  DEFAULT_CONFETTI_WOBBLE,
  DEFAULT_VERTICAL_SPACING,
} from '../constants';
import {
  buildAtlasColors,
  parseFlakeChildren,
} from '../hooks/useConfettiFlakes';
import {
  computeSpawnGrid as computeSkiaSpawnGrid,
  estimateFallingDuration as estimateSkiaFallingDuration,
  generateFallingBoxesArray,
} from '../utils';
import {
  computeSizeFlags,
  toRuntimeInputs,
  toSizeInputs,
  toSpawnInputs,
} from '../webgpu/resourcePacking';
import {
  RUNTIME_BYTES,
  SIZE_META_BYTES,
  SPAWN_BYTES,
  RuntimeSchema,
  SizeSchema,
  SpawnSchema,
  UNIFORMS_BYTES,
  UniformsSchema,
} from '../webgpu/shaders/confetti';
import {
  computeSpawnGrid as computeGpuSpawnGrid,
  estimateFallingDuration as estimateGpuFallingDuration,
  generateSpawnsArray,
} from '../webgpu/utils';

const CONTAINER = {
  width: 393,
  height: 852,
};

const DEFAULT_COUNT = 96;
const DEFAULT_SEED = 0xdecafbad;

type Scenario = {
  count: number;
  colors: string[];
  colorOverrides: ReturnType<typeof buildAtlasColors>['colorOverrides'];
  columnsNum: number;
  columnWidth: number;
  cycleDurationSeconds: number;
  maxFlakeHeight: number;
  maxFlakeWidth: number;
  parentColorCount: number;
  rowsNum: number;
  sizeFlagsByIndex: number[];
  sizeIsTextured: boolean[];
  sizeVariations: ReturnType<typeof parseFlakeChildren>;
  verticalOffset: number;
  verticalSpacing: number;
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

const getMinMax = (values: number[]) => {
  if (values.length === 0) {
    throw new Error('Cannot summarize an empty array.');
  }

  let min = values[0]!;
  let max = values[0]!;
  for (const value of values) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return { max, min };
};

const expectInRange = (value: number, min: number, max: number) => {
  expect(value).toBeGreaterThanOrEqual(min);
  expect(value).toBeLessThanOrEqual(max);
};

const expectFloat32 = (actual: number | undefined, expected: number) => {
  expect(actual).toBeCloseTo(expected, 5);
};

const createSingleScenario = (count = DEFAULT_COUNT): Scenario => {
  const sizeVariations = parseFlakeChildren(undefined, 'glossy');
  const {
    allColors,
    colorOverrides,
    parentColorCount,
    sizeIsTextured,
  } = buildAtlasColors(sizeVariations, DEFAULT_COLORS);

  const maxFlakeWidth = Math.max(
    ...sizeVariations.map((size) => size.width)
  );
  const maxFlakeHeight = Math.max(
    ...sizeVariations.map((size) => size.height)
  );
  const skiaGrid = computeSkiaSpawnGrid({
    count,
    containerHeight: CONTAINER.height,
    containerWidth: CONTAINER.width,
    maxFlakeHeight,
    maxFlakeWidth,
    verticalSpacing: DEFAULT_VERTICAL_SPACING,
  });
  const gpuGrid = computeGpuSpawnGrid({
    count,
    containerHeight: CONTAINER.height,
    containerWidth: CONTAINER.width,
    maxFlakeHeight,
    maxFlakeWidth,
    verticalSpacing: DEFAULT_VERTICAL_SPACING,
  });

  expect(gpuGrid).toEqual(skiaGrid);

  const maxWobble = DEFAULT_CONFETTI_WOBBLE.max;
  const skiaDuration = estimateSkiaFallingDuration({
    containerHeight: CONTAINER.height,
    gravity: DEFAULT_CONFETTI_GRAVITY,
    maxWobble,
    verticalOffset: skiaGrid.verticalOffset,
  });
  const gpuDuration = estimateGpuFallingDuration({
    containerHeight: CONTAINER.height,
    gravity: DEFAULT_CONFETTI_GRAVITY,
    maxWobble,
    verticalOffset: gpuGrid.verticalOffset,
  });

  expect(gpuDuration).toBe(skiaDuration);

  return {
    colors: allColors,
    colorOverrides,
    count,
    cycleDurationSeconds: skiaDuration / 1000,
    maxFlakeHeight,
    maxFlakeWidth,
    parentColorCount,
    sizeFlagsByIndex: computeSizeFlags(sizeVariations),
    sizeIsTextured,
    sizeVariations,
    verticalSpacing: DEFAULT_VERTICAL_SPACING,
    ...skiaGrid,
  };
};

const createSkiaState = (scenario: Scenario, continuous = false) =>
  withSeededRandom(DEFAULT_SEED, () =>
    generateFallingBoxesArray({
      columnWidth: scenario.columnWidth,
      columnsNum: scenario.columnsNum,
      containerHeight: CONTAINER.height,
      containerWidth: CONTAINER.width,
      continuous,
      count: scenario.count,
      gravity: DEFAULT_CONFETTI_GRAVITY,
      infinite: false,
      maxFlakeHeight: scenario.maxFlakeHeight,
      maxFlakeWidth: scenario.maxFlakeWidth,
      parentColorCount: scenario.parentColorCount,
      rowsNum: scenario.rowsNum,
      sizeColorOverrides: scenario.colorOverrides,
      sizeIsTextured: scenario.sizeIsTextured,
      sizeVariations: scenario.sizeVariations.length,
      totalTime: scenario.cycleDurationSeconds,
      verticalOffset: scenario.verticalOffset,
      verticalSpacing: scenario.verticalSpacing,
    })
  );

const createGpuState = (scenario: Scenario, continuous = false) =>
  withSeededRandom(DEFAULT_SEED, () =>
    generateSpawnsArray({
      columnWidth: scenario.columnWidth,
      columnsNum: scenario.columnsNum,
      containerHeight: CONTAINER.height,
      containerWidth: CONTAINER.width,
      continuous,
      count: scenario.count,
      gravity: DEFAULT_CONFETTI_GRAVITY,
      infinite: false,
      maxFlakeHeight: scenario.maxFlakeHeight,
      maxFlakeWidth: scenario.maxFlakeWidth,
      parentColorCount: scenario.parentColorCount,
      rowsNum: scenario.rowsNum,
      sizeColorOverrides: scenario.colorOverrides,
      sizeFlagsByIndex: scenario.sizeFlagsByIndex,
      sizeVariations: scenario.sizeVariations.length,
      totalTime: scenario.cycleDurationSeconds,
      verticalOffset: scenario.verticalOffset,
      verticalSpacing: scenario.verticalSpacing,
    })
  );

const expectedSpawnXAtIndex = (scenario: Scenario, index: number) => {
  const rowIndex = Math.floor(index / scenario.columnsNum);
  if (rowIndex === scenario.rowsNum - 1) {
    const itemsInLastRow =
      scenario.count - (scenario.rowsNum - 1) * scenario.columnsNum;
    const lastRowSpacing =
      (CONTAINER.width - itemsInLastRow * scenario.maxFlakeWidth) /
      (itemsInLastRow + 1);
    const positionInLastRow =
      index - (scenario.rowsNum - 1) * scenario.columnsNum;
    return (
      lastRowSpacing +
      positionInLastRow * (scenario.maxFlakeWidth + lastRowSpacing)
    );
  }

  return (index % scenario.columnsNum) * scenario.columnWidth;
};

const expectPhaseOffsetsAreStratified = (phaseOffsets: number[]) => {
  const sorted = [...phaseOffsets].sort((a, b) => a - b);
  for (let index = 0; index < sorted.length; index++) {
    expectInRange(
      sorted[index]!,
      index / sorted.length,
      (index + 1) / sorted.length
    );
  }
};

describe('single confetti engine parity framework', () => {
  it('keeps Skia and GPU grid/duration math identical', () => {
    for (const count of [1, 12, DEFAULT_COUNT, 240]) {
      const scenario = createSingleScenario(count);

      expect(scenario.columnsNum).toBeGreaterThan(0);
      expect(scenario.rowsNum).toBeGreaterThan(0);
      expect(scenario.cycleDurationSeconds).toBeGreaterThan(0);
    }
  });

  it('generates comparable single-cycle particle envelopes', () => {
    const scenario = createSingleScenario();
    const skiaState = createSkiaState(scenario);
    const gpuSpawns = createGpuState(scenario);

    expect(skiaState.boxes).toHaveLength(scenario.count);
    expect(gpuSpawns).toHaveLength(scenario.count);

    const skiaX = skiaState.boxes.map((box) => box.spawnX);
    const gpuX = gpuSpawns.map((spawn) => spawn.pos0[0]);
    expect(skiaX).toEqual(gpuX);

    for (let index = 0; index < scenario.count; index++) {
      const expectedX = expectedSpawnXAtIndex(scenario, index);
      expect(skiaState.boxes[index]!.spawnX).toBeCloseTo(expectedX, 5);
      expect(gpuSpawns[index]!.pos0[0]).toBeCloseTo(expectedX, 5);
    }

    const allowedYJitter = scenario.verticalSpacing / 2;
    const skiaY = skiaState.boxes.map((box) => box.spawnY);
    const gpuY = gpuSpawns.map((spawn) => spawn.pos0[1]);
    const skiaYRange = getMinMax(skiaY);
    const gpuYRange = getMinMax(gpuY);

    expect(skiaYRange.min).toBeGreaterThanOrEqual(
      scenario.verticalOffset - allowedYJitter
    );
    expect(gpuYRange.min).toBeGreaterThanOrEqual(
      scenario.verticalOffset - allowedYJitter
    );
    expect(skiaYRange.max).toBeLessThanOrEqual(
      scenario.verticalOffset +
        (scenario.rowsNum - 1) *
          (Math.min(scenario.maxFlakeHeight, 20) + scenario.verticalSpacing) +
        allowedYJitter
    );
    expect(gpuYRange.max).toBeLessThanOrEqual(
      scenario.verticalOffset +
        (scenario.rowsNum - 1) *
          (Math.min(scenario.maxFlakeHeight, 20) + scenario.verticalSpacing) +
        allowedYJitter
    );

    for (const box of skiaState.boxes) {
      expectInRange(box.sizeIndex, 0, scenario.sizeVariations.length - 1);
      expectInRange(box.colorIndex, 0, scenario.colors.length - 1);
      expectInRange(box.depthScale, 0.8, 1);
    }

    for (const spawn of gpuSpawns) {
      expectInRange(spawn.meta[0], 0, scenario.sizeVariations.length - 1);
      expectInRange(spawn.meta[1], 0, scenario.colors.length - 1);
      expect(Number.isFinite(spawn.pos0[2])).toBe(true);
      expect(Number.isFinite(spawn.vel0[0])).toBe(true);
      expect(Number.isFinite(spawn.vel0[1])).toBe(true);
      expect(Number.isFinite(spawn.vel0[2])).toBe(true);
      const quatLength = Math.hypot(...spawn.quat0);
      expect(quatLength).toBeCloseTo(1, 5);
    }
  });

  it('keeps continuous mode phase offsets stratified in both engines', () => {
    const scenario = createSingleScenario(64);
    const skiaState = createSkiaState(scenario, true);
    const gpuSpawns = createGpuState(scenario, true);

    expectPhaseOffsetsAreStratified(
      skiaState.boxes.map((box) => box.phaseOffset)
    );
    expectPhaseOffsetsAreStratified(
      gpuSpawns.map((spawn) => spawn.meta[3])
    );
  });

  it('maps GPU host data to the TypeGPU schemas', () => {
    const scenario = createSingleScenario(2);
    const gpuSpawns = createGpuState(scenario);
    const sizeFlags = computeSizeFlags(scenario.sizeVariations);
    const sizeInputs = toSizeInputs(scenario.sizeVariations, sizeFlags);
    const spawnInputs = toSpawnInputs(gpuSpawns);
    const runtimeInputs = toRuntimeInputs(
      gpuSpawns,
      scenario.cycleDurationSeconds
    );

    expect(SPAWN_BYTES).toBe(d.sizeOf(SpawnSchema));
    expect(RUNTIME_BYTES).toBe(d.sizeOf(RuntimeSchema));
    expect(SIZE_META_BYTES).toBe(d.sizeOf(SizeSchema));
    expect(UNIFORMS_BYTES).toBe(d.sizeOf(UniformsSchema));
    expect(SPAWN_BYTES).toBe(96);
    expect(RUNTIME_BYTES).toBe(64);
    expect(SIZE_META_BYTES).toBe(16);
    expect(UNIFORMS_BYTES).toBe(128);

    expect(sizeInputs).toHaveLength(scenario.sizeVariations.length);
    expect(spawnInputs).toHaveLength(gpuSpawns.length);
    expect(runtimeInputs).toHaveLength(gpuSpawns.length);

    const firstSpawn = gpuSpawns[0]!;
    const firstSpawnInput = spawnInputs[0]!;
    const firstRuntimeInput = runtimeInputs[0]!;
    const firstSizeInput = sizeInputs[0]!;

    expect(firstSpawnInput.pos0).toBe(firstSpawn.pos0);
    expect(firstSpawnInput.vel0).toBe(firstSpawn.vel0);
    expect(firstSpawnInput.quat0).toBe(firstSpawn.quat0);
    expect(firstSpawnInput.omega0).toBe(firstSpawn.omega0);
    expect(firstSpawnInput.drag).toBe(firstSpawn.drag);
    expect(firstSpawnInput.info).toBe(firstSpawn.meta);

    expect(firstRuntimeInput.pos).toBe(firstSpawn.pos0);
    expectFloat32(firstRuntimeInput.pos[0], firstSpawn.pos0[0]);
    expectFloat32(firstRuntimeInput.pos[1], firstSpawn.pos0[1]);
    expectFloat32(firstRuntimeInput.pos[2], firstSpawn.pos0[2]);
    expectFloat32(
      firstRuntimeInput.life,
      -firstSpawn.meta[3] * scenario.cycleDurationSeconds
    );
    expect(firstRuntimeInput.vel).toBe(firstSpawn.vel0);
    expect(firstRuntimeInput.quat).toBe(firstSpawn.quat0);
    expect(firstRuntimeInput.omega).toBe(firstSpawn.omega0);

    expect(firstSizeInput.dims[0]).toBe(scenario.sizeVariations[0]!.width);
    expect(firstSizeInput.dims[1]).toBe(scenario.sizeVariations[0]!.height);
    expect(firstSizeInput.dims[2]).toBe(scenario.sizeVariations[0]!.radius);
    expect(firstSizeInput.dims[3]).toBe(1);
  });
});
