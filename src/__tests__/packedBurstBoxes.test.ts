import { afterEach, describe, expect, it, jest } from '@jest/globals';

import {
  BURST_COLOR_INDEX,
  BURST_DEPTH_SCALE,
  BURST_FLAGS,
  BURST_FLAG_CLOCKWISE,
  BURST_FLAG_TEXTURED,
  BURST_FLOAT_STRIDE,
  BURST_INITIAL_ROTATION,
  BURST_LAUNCH_DELAY,
  BURST_META_STRIDE,
  BURST_ORIGIN_DELAY,
  BURST_ORIGIN_INDEX,
  BURST_ROTATION_X,
  BURST_ROTATION_Z,
  BURST_SIZE_INDEX,
  BURST_VX,
  BURST_VY,
  generatePackedCannonBoxes,
  generatePackedPIBoxes,
} from '../packedBurstBoxes';
import {
  generateCannonBoxesArray,
  generatePIBoxesArray,
  type CannonConfig,
  type PIConfig,
} from '../utils';

const shared = {
  containerHeight: 800,
  launchDelayMax: 0.15,
  sizeColorOverrides: [{ start: 2, count: 3 }],
  parentColorCount: 4,
  sizeIsTextured: [true],
};

const expectPackedCommon = (
  packed: ReturnType<typeof generatePackedPIBoxes>,
  object:
    | ReturnType<typeof generatePIBoxesArray>[number]
    | ReturnType<typeof generateCannonBoxesArray>[number],
  index: number
) => {
  const valueOffset = index * BURST_FLOAT_STRIDE;
  const metaOffset = index * BURST_META_STRIDE;
  expect(packed.values[valueOffset + BURST_VX]).toBe(object.vx);
  expect(packed.values[valueOffset + BURST_VY]).toBe(object.vy);
  expect(packed.values[valueOffset + BURST_LAUNCH_DELAY]).toBe(
    object.launchDelay
  );
  expect(packed.values[valueOffset + BURST_DEPTH_SCALE]).toBe(
    object.depthScale
  );
  expect(packed.values[valueOffset + BURST_ROTATION_X]).toBe(
    object.maxRotation.x
  );
  expect(packed.values[valueOffset + BURST_ROTATION_Z]).toBe(
    object.maxRotation.z
  );
  expect(packed.values[valueOffset + BURST_INITIAL_ROTATION]).toBe(
    object.initialRotation
  );
  expect(packed.metadata[metaOffset + BURST_COLOR_INDEX]).toBe(
    object.colorIndex
  );
  expect(packed.metadata[metaOffset + BURST_SIZE_INDEX]).toBe(object.sizeIndex);
  const flags = packed.metadata[metaOffset + BURST_FLAGS] ?? 0;
  expect((flags & BURST_FLAG_CLOCKWISE) !== 0).toBe(object.clockwise);
  expect((flags & BURST_FLAG_TEXTURED) !== 0).toBe(object.isTextured);
};

describe('packed Skia burst particles', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('preserves PI particle physics without object-per-particle storage', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.42);
    const piConfigs: PIConfig[] = [
      {
        spread: Math.PI,
        count: 3,
        initialSpeed: 1.2,
        speedVariation: { min: 0.8, max: 1.3 },
        colorStart: 0,
        colorCount: 3,
        sizeStart: 0,
        sizeCount: 1,
      },
    ];
    const input = { ...shared, piConfigs, originDelays: [240] };
    const objects = generatePIBoxesArray(input);
    const packed = generatePackedPIBoxes(input);

    expect(packed.values).toHaveLength(objects.length * BURST_FLOAT_STRIDE);
    for (let index = 0; index < objects.length; index++) {
      const object = objects[index]!;
      expectPackedCommon(packed, object, index);
      expect(
        packed.metadata[index * BURST_META_STRIDE + BURST_ORIGIN_INDEX]
      ).toBe(object.originIndex);
      expect(
        packed.values[index * BURST_FLOAT_STRIDE + BURST_ORIGIN_DELAY]
      ).toBe(object.originDelay);
    }
  });

  it('preserves Cannon particle physics without object-per-particle storage', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.42);
    const cannonConfigs: CannonConfig[] = [
      {
        spread: Math.PI / 3,
        speed: 1.5,
        count: 3,
        speedVariation: { min: 0.8, max: 1.3 },
        colorStart: 0,
        colorCount: 3,
        sizeStart: 0,
        sizeCount: 1,
        target: { x: 200, y: 100 },
      },
    ];
    const input = {
      ...shared,
      cannonConfigs,
      cannonsPositions: [{ x: 20, y: 700 }],
    };
    const objects = generateCannonBoxesArray(input);
    const packed = generatePackedCannonBoxes(input);

    expect(packed.values).toHaveLength(objects.length * BURST_FLOAT_STRIDE);
    for (let index = 0; index < objects.length; index++) {
      const object = objects[index]!;
      expectPackedCommon(packed, object, index);
      expect(
        packed.metadata[index * BURST_META_STRIDE + BURST_ORIGIN_INDEX]
      ).toBe(object.cannonIndex);
    }
  });
});
