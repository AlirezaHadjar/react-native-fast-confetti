export type RgbaFrame = {
  data: Uint8Array | Uint8ClampedArray;
  height: number;
  width: number;
};

export type VisualDiffBudget = {
  maxAlphaCoverageDelta: number;
  maxChangedPixelRatio: number;
  maxMeanChannelDelta: number;
  perChannelThreshold: number;
};

export type VisualDiffResult = {
  alphaCoverageDelta: number;
  changedPixelRatio: number;
  changedPixels: number;
  meanChannelDelta: number;
  passed: boolean;
  pixels: number;
  receivedAlphaCoverage: number;
  referenceAlphaCoverage: number;
};

export const SINGLE_CONFETTI_VISUAL_BUDGET: VisualDiffBudget = {
  maxAlphaCoverageDelta: 0.015,
  maxChangedPixelRatio: 0.08,
  maxMeanChannelDelta: 0.02,
  perChannelThreshold: 18,
};

const assertSameFrameShape = (reference: RgbaFrame, received: RgbaFrame) => {
  if (reference.width !== received.width || reference.height !== received.height) {
    throw new Error(
      `Frame sizes do not match: ${reference.width}x${reference.height} vs ${received.width}x${received.height}`
    );
  }

  const expectedLength = reference.width * reference.height * 4;
  if (
    reference.data.length !== expectedLength ||
    received.data.length !== expectedLength
  ) {
    throw new Error(
      `RGBA frame length mismatch: expected ${expectedLength}, got ${reference.data.length} and ${received.data.length}`
    );
  }
};

export const compareRgbaFrames = (
  reference: RgbaFrame,
  received: RgbaFrame,
  budget: VisualDiffBudget
): VisualDiffResult => {
  assertSameFrameShape(reference, received);

  const pixels = reference.width * reference.height;
  let changedPixels = 0;
  let totalChannelDelta = 0;
  let referenceAlpha = 0;
  let receivedAlpha = 0;

  for (let pixel = 0; pixel < pixels; pixel++) {
    const base = pixel * 4;
    let maxPixelChannelDelta = 0;

    for (let channel = 0; channel < 4; channel++) {
      const channelDelta = Math.abs(
        reference.data[base + channel]! - received.data[base + channel]!
      );
      totalChannelDelta += channelDelta;
      if (channelDelta > maxPixelChannelDelta) {
        maxPixelChannelDelta = channelDelta;
      }
    }

    if (maxPixelChannelDelta > budget.perChannelThreshold) {
      changedPixels++;
    }

    referenceAlpha += reference.data[base + 3]!;
    receivedAlpha += received.data[base + 3]!;
  }

  const changedPixelRatio = changedPixels / pixels;
  const meanChannelDelta = totalChannelDelta / (pixels * 4 * 255);
  const referenceAlphaCoverage = referenceAlpha / (pixels * 255);
  const receivedAlphaCoverage = receivedAlpha / (pixels * 255);
  const alphaCoverageDelta = Math.abs(
    referenceAlphaCoverage - receivedAlphaCoverage
  );

  return {
    alphaCoverageDelta,
    changedPixelRatio,
    changedPixels,
    meanChannelDelta,
    passed:
      changedPixelRatio <= budget.maxChangedPixelRatio &&
      meanChannelDelta <= budget.maxMeanChannelDelta &&
      alphaCoverageDelta <= budget.maxAlphaCoverageDelta,
    pixels,
    receivedAlphaCoverage,
    referenceAlphaCoverage,
  };
};
