export type ReadableValue<Value> = {
  get: () => Value;
};

export type WritableValue<Value> = ReadableValue<Value> & {
  set: (value: Value) => void;
};
