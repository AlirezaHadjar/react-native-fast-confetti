type GPUOperation<Result> = () => Result | Promise<Result>;

/**
 * Keeps asynchronous setup and teardown on a common promise boundary. Dawn's
 * device lock provides the cross-runtime synchronization for actual GPU calls.
 */
export const withExclusiveGPUAccess = <Result>(
  operation: GPUOperation<Result>
): Promise<Result> => Promise.resolve().then(operation);

/** Runs a GPU operation in the UI runtime that owns the canvas frame. */
export const runOrDeferGPUOperationOnUI = (operation: () => void) => {
  'worklet';
  operation();
};
