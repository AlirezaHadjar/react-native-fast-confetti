import { describe, expect, it, jest } from '@jest/globals';
import { Flake } from '../FlakeComponent';
import { parseFlakeChildren } from '../hooks/useConfettiFlakes';

jest.mock('react-native-reanimated', () => ({
  Easing: { bezier: jest.fn(() => jest.fn()) },
}));

describe('built-in flake shapes', () => {
  it('keeps rectangle as the default shape', () => {
    const flakes = parseFlakeChildren(
      [<Flake key="default" size={12} />],
      'solid'
    );

    expect(flakes[0]?.shape).toBe('rectangle');
  });

  it.each(['heart', 'star', 'flower', 'streamer'] as const)(
    'parses the %s silhouette',
    (shape) => {
      const flakes = parseFlakeChildren(
        [<Flake key={shape} size={18} shape={shape} />],
        'solid'
      );

      expect(flakes[0]?.shape).toBe(shape);
    }
  );
});
