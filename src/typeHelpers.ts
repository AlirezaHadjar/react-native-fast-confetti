type BuildFixedLengthArray<
  Value,
  Length extends number,
  Result extends Value[] = [],
> = Result['length'] extends Length
  ? Result
  : BuildFixedLengthArray<Value, Length, [...Result, Value]>;

export type FixedLengthArray<Value, Length extends number> =
  number extends Length ? Value[] : BuildFixedLengthArray<Value, Length>;

export type ReadonlyFixedLengthArray<Value, Length extends number> = Readonly<
  FixedLengthArray<Value, Length>
>;
