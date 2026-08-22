import { describe, expect, it, jest } from '@jest/globals';

import {
  createGPUFrameRetirement,
  destroyGPUResourceSet,
  retireGPUResourceSet,
} from '../webgpu/resourceCleanup';

describe('GPU resource cleanup', () => {
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

  it('waits for frame retirement and submitted GPU work', async () => {
    const destroy = jest.fn();
    let finishSubmittedWork!: () => void;
    const queue = {
      onSubmittedWorkDone: jest.fn(
        () =>
          new Promise<void>((resolve) => {
            finishSubmittedWork = resolve;
          })
      ),
    } as unknown as GPUQueue;
    const frame = createGPUFrameRetirement();

    const retirement = retireGPUResourceSet(queue, destroy, frame.promise);
    await Promise.resolve();
    expect(queue.onSubmittedWorkDone).not.toHaveBeenCalled();
    expect(destroy).not.toHaveBeenCalled();

    frame.resolve();
    await Promise.resolve();
    expect(queue.onSubmittedWorkDone).toHaveBeenCalledTimes(1);
    expect(destroy).not.toHaveBeenCalled();

    finishSubmittedWork();
    await retirement;
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('still destroys resources when the device queue is lost', async () => {
    const destroy = jest.fn();
    const queue = {
      onSubmittedWorkDone: jest.fn(() => Promise.reject(new Error('lost'))),
    } as unknown as GPUQueue;

    await retireGPUResourceSet(queue, destroy);

    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
