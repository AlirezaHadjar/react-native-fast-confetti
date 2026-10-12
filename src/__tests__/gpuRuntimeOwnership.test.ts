import { describe, expect, it, jest } from '@jest/globals';
import {
  runOrDeferGPUOperationOnUI,
  withExclusiveGPUAccess,
} from '../webgpu/gpuRuntimeOwnership';

describe('GPU runtime operations', () => {
  it('preserves operation results and errors', async () => {
    const order: string[] = [];
    await expect(withExclusiveGPUAccess(() => 42)).resolves.toBe(42);
    await expect(
      withExclusiveGPUAccess(() => {
        order.push('operation');
        throw new Error('setup failed');
      })
    ).rejects.toThrow('setup failed');
    expect(order).toEqual(['operation']);
  });

  it('runs UI-owned operations immediately', () => {
    const operation = jest.fn();
    runOrDeferGPUOperationOnUI(operation);
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
