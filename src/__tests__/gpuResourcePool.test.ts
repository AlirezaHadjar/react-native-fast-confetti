import { describe, expect, it, jest } from '@jest/globals';

import {
  acquireIdleGPUResources,
  releaseIdleGPUResources,
} from '../webgpu/resourcePool';

let changeAppState: (state: string) => void;
jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  AppState: {
    currentState: 'active',
    addEventListener: (_event: string, callback: typeof changeAppState) => {
      changeAppState = callback;
      return { remove: () => {} };
    },
  },
}));

const makeDevice = () => {
  let lose!: () => void;
  const lost = new Promise<void>((resolve) => {
    lose = resolve;
  });
  return { device: { lost } as unknown as GPUDevice, lose };
};

describe('GPU resource leases', () => {
  it('cannot lend an idle set to two simultaneous canvases', () => {
    const { device } = makeDevice();
    const resources = {};
    const destroy = jest.fn();
    expect(
      releaseIdleGPUResources(device, 'same', resources, 64, destroy)
    ).toBe(true);
    expect(acquireIdleGPUResources(device, 'same')).toBe(resources);
    expect(acquireIdleGPUResources(device, 'same')).toBeUndefined();
    expect(destroy).not.toHaveBeenCalled();
  });

  it('evicts the oldest idle allocations within both bounds', () => {
    const { device } = makeDevice();
    const first = jest.fn();
    releaseIdleGPUResources(device, 'first', {}, 40 * 1024 * 1024, first);
    releaseIdleGPUResources(device, 'second', {}, 40 * 1024 * 1024, jest.fn());
    expect(first).toHaveBeenCalledTimes(1);
    expect(acquireIdleGPUResources(device, 'first')).toBeUndefined();

    const { device: smallDevice } = makeDevice();
    const oldest = jest.fn();
    releaseIdleGPUResources(smallDevice, 'oldest', {}, 1, oldest);
    for (let index = 0; index < 16; index++) {
      releaseIdleGPUResources(smallDevice, `${index}`, {}, 1, jest.fn());
    }
    expect(oldest).toHaveBeenCalledTimes(1);
    expect(
      releaseIdleGPUResources(
        smallDevice,
        'oversized',
        {},
        65 * 1024 * 1024,
        jest.fn()
      )
    ).toBe(false);
  });

  it('never lends or retains idle resources after device loss', async () => {
    const { device, lose } = makeDevice();
    const destroy = jest.fn();
    releaseIdleGPUResources(device, 'key', {}, 1, destroy);
    lose();
    await Promise.resolve();
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(acquireIdleGPUResources(device, 'key')).toBeUndefined();
    expect(releaseIdleGPUResources(device, 'key', {}, 1, jest.fn())).toBe(
      false
    );
  });

  it('drops idle allocations on backgrounding without retiring an active lease', () => {
    const { device } = makeDevice();
    const active = {};
    const activeDestroy = jest.fn();
    const idleDestroy = jest.fn();
    releaseIdleGPUResources(device, 'active', active, 1, activeDestroy);
    expect(acquireIdleGPUResources(device, 'active')).toBe(active);
    releaseIdleGPUResources(device, 'idle', {}, 1, idleDestroy);
    changeAppState('background');
    expect(idleDestroy).toHaveBeenCalledTimes(1);
    expect(activeDestroy).not.toHaveBeenCalled();
    expect(
      releaseIdleGPUResources(device, 'active', active, 1, activeDestroy)
    ).toBe(false);
    changeAppState('active');
    expect(
      releaseIdleGPUResources(device, 'active', active, 1, activeDestroy)
    ).toBe(true);
  });
});
