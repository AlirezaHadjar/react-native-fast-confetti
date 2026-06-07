import { describe, expect, it } from '@jest/globals';

import {
  compareRgbaFrames,
  SINGLE_CONFETTI_VISUAL_BUDGET,
  type RgbaFrame,
} from '../__fixtures__/visualParityHarness';

const createFrame = (
  width: number,
  height: number,
  pixel: [number, number, number, number]
): RgbaFrame => {
  const data = new Uint8Array(width * height * 4);
  for (let offset = 0; offset < data.length; offset += 4) {
    data[offset + 0] = pixel[0];
    data[offset + 1] = pixel[1];
    data[offset + 2] = pixel[2];
    data[offset + 3] = pixel[3];
  }
  return { data, height, width };
};

const cloneFrame = (frame: RgbaFrame): RgbaFrame => ({
  data: new Uint8Array(frame.data),
  height: frame.height,
  width: frame.width,
});

describe('visual parity harness', () => {
  it('passes identical RGBA frames', () => {
    const reference = createFrame(4, 4, [255, 80, 40, 255]);
    const received = cloneFrame(reference);

    const diff = compareRgbaFrames(
      reference,
      received,
      SINGLE_CONFETTI_VISUAL_BUDGET
    );

    expect(diff.passed).toBe(true);
    expect(diff.changedPixels).toBe(0);
    expect(diff.meanChannelDelta).toBe(0);
    expect(diff.alphaCoverageDelta).toBe(0);
  });

  it('allows small anti-aliasing-level channel differences', () => {
    const reference = createFrame(10, 10, [255, 80, 40, 128]);
    const received = cloneFrame(reference);
    received.data[0] = 248;
    received.data[1] = 87;
    received.data[2] = 45;
    received.data[3] = 126;

    const diff = compareRgbaFrames(
      reference,
      received,
      SINGLE_CONFETTI_VISUAL_BUDGET
    );

    expect(diff.passed).toBe(true);
    expect(diff.changedPixels).toBe(0);
    expect(diff.meanChannelDelta).toBeGreaterThan(0);
  });

  it('fails large geometry-level changes', () => {
    const reference = createFrame(10, 10, [0, 0, 0, 0]);
    const received = cloneFrame(reference);

    for (let pixel = 0; pixel < 25; pixel++) {
      const base = pixel * 4;
      received.data[base + 0] = 255;
      received.data[base + 1] = 80;
      received.data[base + 2] = 40;
      received.data[base + 3] = 255;
    }

    const diff = compareRgbaFrames(
      reference,
      received,
      SINGLE_CONFETTI_VISUAL_BUDGET
    );

    expect(diff.passed).toBe(false);
    expect(diff.changedPixelRatio).toBe(0.25);
    expect(diff.alphaCoverageDelta).toBe(0.25);
  });

  it('rejects frames with different dimensions', () => {
    const reference = createFrame(2, 2, [0, 0, 0, 0]);
    const received = createFrame(3, 2, [0, 0, 0, 0]);

    expect(() =>
      compareRgbaFrames(reference, received, SINGLE_CONFETTI_VISUAL_BUDGET)
    ).toThrow('Frame sizes do not match');
  });
});
