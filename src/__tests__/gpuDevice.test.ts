import { describe, expect, it, jest } from '@jest/globals';
import {
  createGPUDeviceStore,
  requestDefaultGPUDevice,
} from '../webgpu/hooks/useGPUDevice';

jest.mock('react-native-webgpu', () => ({
  warnIfNotHardwareAccelerated: () => undefined,
}));

const createDevice = () => {
  let lose!: () => void;
  const lost = new Promise<GPUDeviceLostInfo>((resolve) => {
    lose = () =>
      resolve({
        message: 'test device loss',
        reason: 'destroyed',
      } as GPUDeviceLostInfo);
  });

  return {
    device: { lost } as GPUDevice,
    lose,
  };
};

describe('shared GPU device store', () => {
  it('warns for fallback adapters before requesting a device', async () => {
    const { device } = createDevice();
    const adapter = {
      requestDevice: jest.fn(async () => device),
    } as unknown as GPUAdapter;
    const gpu = {
      requestAdapter: jest.fn(async () => adapter),
    } as unknown as GPU;
    const warnForFallback = jest.fn();

    await expect(
      requestDefaultGPUDevice(gpu, warnForFallback)
    ).resolves.toBe(device);

    expect(gpu.requestAdapter).toHaveBeenCalledWith({
      powerPreference: 'high-performance',
    });
    expect(warnForFallback).toHaveBeenCalledWith(adapter);
    expect(adapter.requestDevice).toHaveBeenCalledTimes(1);
  });

  it('deduplicates concurrent device requests', async () => {
    const { device } = createDevice();
    const requestDevice = jest.fn(async () => device);
    const store = createGPUDeviceStore(requestDevice);

    const [first, second] = await Promise.all([
      store.acquire(),
      store.acquire(),
    ]);

    expect(requestDevice).toHaveBeenCalledTimes(1);
    expect(first).toBe(device);
    expect(second).toBe(device);
    expect(store.getSnapshot()).toBe(device);
  });

  it('reacquires a lost device while consumers are subscribed', async () => {
    const first = createDevice();
    const second = createDevice();
    const requestDevice = jest
      .fn<() => Promise<GPUDevice | null>>()
      .mockResolvedValueOnce(first.device)
      .mockResolvedValueOnce(second.device);
    const store = createGPUDeviceStore(requestDevice);
    const listener = jest.fn();
    const unsubscribe = store.subscribe(listener);

    await store.acquire();
    first.lose();
    await Promise.resolve();
    await store.acquire();

    expect(requestDevice).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot()).toBe(second.device);
    expect(listener).toHaveBeenCalledTimes(3);

    unsubscribe();
  });

  it('exposes acquisition failures and permits a retry', async () => {
    const { device } = createDevice();
    const failure = new Error('adapter unavailable');
    const requestDevice = jest
      .fn<() => Promise<GPUDevice | null>>()
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce(device);
    const store = createGPUDeviceStore(requestDevice);

    await expect(store.acquire()).resolves.toBeNull();
    expect(store.getErrorSnapshot()).toBe(failure);

    await expect(store.acquire()).resolves.toBe(device);
    expect(store.getErrorSnapshot()).toBeNull();
    expect(requestDevice).toHaveBeenCalledTimes(2);
  });
});
