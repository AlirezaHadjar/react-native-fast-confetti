const identity = (value: number) => value;

export const Easing = {
  bezier: () => identity,
  linear: identity,
};

export const Extrapolation = {
  CLAMP: 'clamp',
  EXTEND: 'extend',
  IDENTITY: 'identity',
};

export const interpolate = (
  value: number,
  input: [number, number],
  output: [number, number]
) => {
  const [inputMin, inputMax] = input;
  const [outputMin, outputMax] = output;
  const progress = (value - inputMin) / (inputMax - inputMin);
  return outputMin + progress * (outputMax - outputMin);
};

export const runOnUI =
  <Args extends unknown[], Result>(fn: (...args: Args) => Result) =>
  (...args: Args) =>
    fn(...args);

export const useSharedValue = <T>(initialValue: T) => {
  let current = initialValue;
  return {
    get: () => current,
    set: (nextValue: T) => {
      current = nextValue;
    },
    value: current,
  };
};
