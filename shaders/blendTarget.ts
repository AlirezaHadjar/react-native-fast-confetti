export const createAlphaBlendTarget = (
  format: GPUTextureFormat
): GPUColorTargetState => ({
  format,
  blend: {
    color: {
      srcFactor: 'src-alpha',
      dstFactor: 'one-minus-src-alpha',
      operation: 'add',
    },
    alpha: {
      srcFactor: 'one',
      dstFactor: 'one-minus-src-alpha',
      operation: 'add',
    },
  },
});
