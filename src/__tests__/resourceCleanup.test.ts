import { describe, expect, it, jest } from '@jest/globals';

import {
  createGPUFrameRetirement,
  destroyGPUResourceSet,
  retireGPUResourceSet,
} from '../webgpu/resourceCleanup';

const mockWaitForGPUFrameRuntime = jest.fn<() => Promise<void>>(async () => {});
jest.mock('../webgpu/androidFrameRuntime', () => ({
  waitForGPUFrameRuntime: () => mockWaitForGPUFrameRuntime(),
}));

const flushMicrotasks = async () => {
  for (let index = 0; index < 6; index += 1) await Promise.resolve();
};

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
    });

    expect(calls).toEqual(['buffer-a', 'buffer-b', 'texture']);
  });

  it('waits for explicit frame retirement before releasing a lease', async () => {
    const destroy = jest.fn<() => void>();
    const frame = createGPUFrameRetirement();

    const retirement = retireGPUResourceSet(destroy, frame.promise);
    await Promise.resolve();
    expect(destroy).not.toHaveBeenCalled();

    frame.resolve();
    await retirement;
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('cannot release a lease before the owning runtime stops submitting', async () => {
    let releaseOwner!: () => void;
    mockWaitForGPUFrameRuntime.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        releaseOwner = resolve;
      })
    );
    const calls: string[] = [];
    const retirement = retireGPUResourceSet(() => {
      calls.push('destroy');
    });
    await flushMicrotasks();
    expect(calls).toEqual([]);
    releaseOwner();
    await retirement;
    expect(calls).toEqual(['destroy']);
  });

  it('still destroys resources when the owning runtime was invalidated', async () => {
    const destroy = jest.fn<() => void>();
    mockWaitForGPUFrameRuntime.mockRejectedValueOnce(new Error('invalidated'));

    await retireGPUResourceSet(destroy);

    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
