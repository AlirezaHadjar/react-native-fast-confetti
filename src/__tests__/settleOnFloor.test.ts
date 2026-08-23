import { describe, expect, it } from '@jest/globals';

import {
  estimateFloorSettlingDuration,
  resolveSettleOnFloor,
} from '../webgpu/settleOnFloor';
import type { SettleOnFloorConfig } from '../webgpu/types';

describe('settleOnFloor', () => {
  it('is disabled when omitted', () => {
    expect(resolveSettleOnFloor(undefined)).toEqual({
      enabled: false,
      restitution: 0.3,
      friction: 0.92,
      variation: 0,
    });
  });

  it('enables an object and applies defaults', () => {
    expect(resolveSettleOnFloor({})).toEqual({
      enabled: true,
      restitution: 0.3,
      friction: 0.92,
      variation: 0,
    });
  });

  it('resolves every option', () => {
    expect(
      resolveSettleOnFloor({
        enabled: false,
        restitution: 0.5,
        friction: 0.75,
        variation: 0.2,
      })
    ).toEqual({
      enabled: false,
      restitution: 0.5,
      friction: 0.75,
      variation: 0.2,
    });
  });

  it.each([
    ['a boolean', true],
    ['an array', []],
    ['invalid enabled', { enabled: 1 }],
    ['invalid restitution', { restitution: -0.1 }],
    ['invalid friction', { friction: 1.1 }],
    ['invalid variation', { variation: Number.NaN }],
  ])('rejects %s', (_label, value) => {
    expect(() =>
      resolveSettleOnFloor(value as unknown as SettleOnFloorConfig)
    ).toThrow('[react-native-fast-confetti] Invalid settleOnFloor');
  });

  it('extends bouncier cycles without changing disabled cycles', () => {
    expect(
      estimateFloorSettlingDuration(resolveSettleOnFloor(undefined))
    ).toBe(0);
    expect(
      estimateFloorSettlingDuration(
        resolveSettleOnFloor({ restitution: 0.3 })
      )
    ).toBeGreaterThan(1);
    expect(
      estimateFloorSettlingDuration(
        resolveSettleOnFloor({ restitution: 1, variation: 1 })
      )
    ).toBeLessThan(6);
  });
});
