import { afterEach, describe, expect, it, jest } from '@jest/globals';

import {
  destroyGPUResourceSet,
  retireGPUResourceSet,
} from '../webgpu/resourceCleanup';

describe('GPU resource cleanup', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('destroys every owned resource even when one teardown throws', () => {
    const calls: string[] = [];
    const destroyable = (name: string, shouldThrow = false) => ({
      destroy: () => {
        calls.push(name);
        if (shouldThrow) throw new Error('already lost');
      },
    });

    destroyGPUResourceSet({
      buffers: [destroyable('buffer-a', true), destroyable('buffer-b')],
      textures: [destroyable('texture')],
      root: destroyable('root'),
    });

    expect(calls).toEqual(['buffer-a', 'buffer-b', 'texture', 'root']);
  });

  it('waits until unmount cleanup before retiring resources', () => {
    jest.useFakeTimers();
    const destroy = jest.fn();
    const cleanup = retireGPUResourceSet(destroy);

    jest.advanceTimersByTime(200);
    expect(destroy).not.toHaveBeenCalled();

    cleanup();
    jest.advanceTimersByTime(99);
    expect(destroy).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
