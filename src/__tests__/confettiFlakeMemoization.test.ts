import { describe, expect, it } from '@jest/globals';

import {
  getSizeVariationsSignature,
  type SizeVariation,
  type TextureInfo,
} from '../hooks/useConfettiFlakes';

const baseSize = (): SizeVariation => ({
  width: 8,
  height: 14,
  radius: 4,
  flakeStyle: 'glossy',
  colors: ['#ff0000', '#00ff00'],
});

describe('confetti atlas semantic identity', () => {
  it('is stable across equivalent arrays and objects', () => {
    expect(getSizeVariationsSignature([baseSize()])).toBe(
      getSizeVariationsSignature([baseSize()])
    );
  });

  it('changes for atlas-visible values', () => {
    const original = baseSize();
    const changed = { ...baseSize(), radius: 2 };

    expect(getSizeVariationsSignature([original])).not.toBe(
      getSizeVariationsSignature([changed])
    );
  });

  it('tracks native texture object identity', () => {
    type ImageContent = Extract<TextureInfo, { type: 'image' }>['content'];
    const contentA = {} as ImageContent;
    const contentB = {} as ImageContent;
    const withTexture = (content: ImageContent): SizeVariation => ({
      ...baseSize(),
      texture: { type: 'image', content },
    });

    expect(getSizeVariationsSignature([withTexture(contentA)])).toBe(
      getSizeVariationsSignature([withTexture(contentA)])
    );
    expect(getSizeVariationsSignature([withTexture(contentA)])).not.toBe(
      getSizeVariationsSignature([withTexture(contentB)])
    );
  });
});
