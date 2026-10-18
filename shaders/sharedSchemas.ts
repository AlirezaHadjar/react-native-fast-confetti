import { d } from 'typegpu';

export const InitSizeSchema = d.struct({
  selection: d.vec4f,
  dims: d.vec4f,
});
