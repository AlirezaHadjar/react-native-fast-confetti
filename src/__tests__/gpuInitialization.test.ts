import { describe, expect, it } from '@jest/globals';
import { tgpu } from 'typegpu';

import type { SizeVariation } from '../hooks/useConfettiFlakes';
import type { CannonConfig, PIConfig } from '../utils';
import {
  toCannonBurstOrigins,
  toPIBurstOrigins,
} from '../webgpu/burstResourcePacking';
import {
  computeSizeFlags,
  createPhasePermutation,
  toInitSizeInputs,
} from '../webgpu/resourcePacking';
import { burstConfettiInit } from '../webgpu/shaders/burstConfetti';
import { confettiInit, confettiVertex } from '../webgpu/shaders/confetti';

const sizes: SizeVariation[] = [
  {
    width: 8,
    height: 12,
    radius: 0,
    flakeStyle: 'glossy',
  },
  {
    width: 14,
    height: 6,
    radius: 2,
    flakeStyle: 'solid',
  },
];

describe('GPU-native particle initialization', () => {
  it('keeps continuous phases exactly stratified without a JS particle array', () => {
    const count = 20_000;
    const { stride, offset } = createPhasePermutation(count, 37);
    const bins = new Set<number>();

    for (let index = 0; index < count; index++) {
      bins.add((index * stride + offset) % count);
    }

    expect(bins.size).toBe(count);
  });

  it('packs only size-level selection metadata for GPU initialization', () => {
    const inputs = toInitSizeInputs(
      sizes,
      computeSizeFlags(sizes),
      [null, { start: 7, count: 3 }],
      5
    );

    expect(inputs).toHaveLength(sizes.length);
    expect(inputs[0]!.selection).toEqual([0, 5, 1, 0]);
    expect(inputs[1]!.selection).toEqual([7, 3, 2 ** 2 + 2 ** 16, 0]);
  });

  it('packs PI origins with prefix ranges instead of expanding particles', () => {
    const configs: PIConfig[] = [
      {
        spread: Math.PI,
        initialSpeed: 1.2,
        count: 12_000,
        speedVariation: { min: 0.8, max: 1.1 },
        colorStart: 0,
        colorCount: 5,
        sizeStart: 0,
        sizeCount: 1,
      },
      {
        spread: Math.PI / 2,
        initialSpeed: 0.9,
        count: 8_000,
        speedVariation: { min: 0.9, max: 1.2 },
        colorStart: 5,
        colorCount: 4,
        sizeStart: 1,
        sizeCount: 1,
      },
    ];

    const origins = toPIBurstOrigins(
      configs,
      [
        { x: 100, y: 500 },
        { x: 300, y: 250 },
      ],
      [0, 250]
    );

    expect(origins).toHaveLength(2);
    expect(origins[0]!.originAndCount).toEqual([100, 500, 0, 12_000]);
    expect(origins[0]!.targetStartAndMode).toEqual([0, 0, 0, 0]);
    expect(origins[1]!.originAndCount).toEqual([300, 250, 250, 8_000]);
    expect(origins[1]!.targetStartAndMode).toEqual([0, 0, 12_000, 0]);
  });

  it('cycles a shorter PI restart position list across configured origins', () => {
    const configs: PIConfig[] = [
      {
        spread: Math.PI,
        initialSpeed: 1,
        count: 10,
        speedVariation: { min: 1, max: 1 },
        colorStart: 0,
        colorCount: 1,
        sizeStart: 0,
        sizeCount: 1,
      },
      {
        spread: Math.PI,
        initialSpeed: 1,
        count: 10,
        speedVariation: { min: 1, max: 1 },
        colorStart: 0,
        colorCount: 1,
        sizeStart: 0,
        sizeCount: 1,
      },
    ];

    const origins = toPIBurstOrigins(configs, [{ x: 120, y: 480 }], [0]);

    expect(origins[0]!.originAndCount.slice(0, 2)).toEqual([120, 480]);
    expect(origins[1]!.originAndCount.slice(0, 2)).toEqual([120, 480]);
  });

  it('packs Cannon targets and prefix ranges without expanding particles', () => {
    const configs: CannonConfig[] = [
      {
        spread: 0.6,
        speed: 1.8,
        count: 10_000,
        speedVariation: { min: 0.8, max: 1.2 },
        colorStart: 0,
        colorCount: 5,
        sizeStart: 0,
        sizeCount: 2,
        target: { x: 200, y: 100 },
      },
      {
        spread: 0.4,
        speed: 1.5,
        count: 10_000,
        speedVariation: { min: 0.9, max: 1.1 },
        colorStart: 0,
        colorCount: 5,
        sizeStart: 0,
        sizeCount: 2,
        target: { x: 250, y: 150 },
      },
    ];

    const origins = toCannonBurstOrigins(configs, [
      { x: -30, y: 880 },
      { x: 420, y: 880 },
    ]);

    expect(origins).toHaveLength(2);
    expect(origins[0]!.targetStartAndMode).toEqual([200, 100, 0, 1]);
    expect(origins[1]!.targetStartAndMode).toEqual([250, 150, 10_000, 1]);
  });

  it('resolves both initialization kernels to WGSL', () => {
    const fallingWGSL = tgpu.resolve([confettiInit]);
    const burstWGSL = tgpu.resolve([burstConfettiInit]);
    const fallingVertexWGSL = tgpu.resolve([confettiVertex]);

    expect(fallingWGSL).toContain('@compute @workgroup_size(64)');
    expect(fallingWGSL).toContain('fn confettiInit');
    expect(fallingWGSL).toContain('let phaseBin');
    expect(burstWGSL).toContain('@compute @workgroup_size(64)');
    expect(burstWGSL).toContain('fn burstConfettiInit');
    expect(fallingVertexWGSL).toContain('@vertex');
  });
});
