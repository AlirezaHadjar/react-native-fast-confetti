import {
  d,
  std,
  tgpu,
  type TgpuRenderPipeline,
  type TgpuRoot,
} from 'typegpu';

export const BURST_VERTS_PER_FLAKE = 6;

export const BurstUniformsSchema = d.struct({
  viewport: d.vec2f,
  opacity: d.f32,
  progress: d.f32,

  totalDuration: d.f32,
  flightDuration: d.f32,
  gravity: d.f32,
  initialScale: d.f32,

  flipIntensity: d.f32,
  drag: d.vec2f,
  _pad0: d.f32,
});

export const BurstParticleSchema = d.struct({
  originAndTiming: d.vec4f,
  velocityAndDepth: d.vec4f,
  rotationAndMeta: d.vec4f,
  indices: d.vec4f,
});

export const BurstSizeSchema = d.struct({
  dims: d.vec4f,
});

export const BurstPaletteColorSchema = d.vec4f;

export const BURST_PARTICLE_BYTES = d.sizeOf(BurstParticleSchema);
export const BURST_SIZE_META_BYTES = d.sizeOf(BurstSizeSchema);
export const BURST_UNIFORMS_BYTES = d.sizeOf(BurstUniformsSchema);

export const BurstParticleArraySchema = (count: number) =>
  d.arrayOf(BurstParticleSchema, count);
export const BurstSizeArraySchema = (count: number) =>
  d.arrayOf(BurstSizeSchema, count);
export const BurstPaletteArraySchema = (count: number) =>
  d.arrayOf(BurstPaletteColorSchema, count);

export const burstRenderLayout = tgpu
  .bindGroupLayout({
    uniforms: {
      uniform: BurstUniformsSchema,
      visibility: ['vertex', 'fragment'],
    },
    particles: {
      storage: d.arrayOf(BurstParticleSchema),
      access: 'readonly',
      visibility: ['vertex'],
    },
    sizes: {
      storage: d.arrayOf(BurstSizeSchema),
      access: 'readonly',
      visibility: ['vertex'],
    },
    palette: {
      storage: d.arrayOf(BurstPaletteColorSchema),
      access: 'readonly',
      visibility: ['vertex', 'fragment'],
    },
    sampler: {
      sampler: 'filtering',
      visibility: ['fragment'],
    },
    textures: {
      texture: d.texture2dArray(d.f32),
      sampleType: 'float',
      visibility: ['fragment'],
    },
  })
  .$idx(0);

const toClip = tgpu.fn([d.vec2f], d.vec2f)((screen) => {
  'use gpu';

  const u = burstRenderLayout.$.uniforms;
  return d.vec2f(
    (screen.x / u.viewport.x) * 2 - 1,
    1 - (screen.y / u.viewport.y) * 2
  );
});

const sdfRoundedBoxPx = tgpu.fn([d.vec2f, d.vec2f, d.f32], d.f32)(
  (p, halfExtent, radius) => {
    'use gpu';

    const r = std.min(radius, std.min(halfExtent.x, halfExtent.y));
    const q = std.abs(p) - (halfExtent - d.vec2f(r));
    const qPos = std.max(q, d.vec2f(0));
    const len = std.length(qPos);
    const inside = std.min(std.max(q.x, q.y), 0);
    return len + inside - r;
  }
);

const VertexOut = {
  position: d.builtin.position,
  uv: d.location(0, d.vec2f),
  color: d.location(1, d.vec4f),
  sizeAndRadius: d.location(2, d.vec3f),
  flagsAndLayer: d.location(3, d.vec2f),
};

export const burstConfettiVertex = tgpu.vertexFn({
  in: {
    vertexIndex: d.builtin.vertexIndex,
    instanceIndex: d.builtin.instanceIndex,
  },
  out: VertexOut,
})(({ vertexIndex, instanceIndex }) => {
  'use gpu';

  const vertInQuad = vertexIndex % 6;
  let uv = d.vec2f(0);
  if (vertInQuad === 0) {
    uv = d.vec2f(0, 0);
  } else if (vertInQuad === 1) {
    uv = d.vec2f(1, 0);
  } else if (vertInQuad === 2) {
    uv = d.vec2f(1, 1);
  } else if (vertInQuad === 3) {
    uv = d.vec2f(0, 0);
  } else if (vertInQuad === 4) {
    uv = d.vec2f(1, 1);
  } else {
    uv = d.vec2f(0, 1);
  }

  const u = burstRenderLayout.$.uniforms;
  const particle = burstRenderLayout.$.particles[instanceIndex]!;
  const sizeIdx = d.u32(particle.indices.x);
  const colorIdx = d.u32(particle.indices.y);
  const size = burstRenderLayout.$.sizes[sizeIdx]!;
  const width = size.dims.x;
  const height = size.dims.y;
  const radius = size.dims.z;
  const flags = size.dims.w;
  const textureLayer = d.f32(std.bitShiftRight(d.u32(flags), d.u32(16)));

  const mode = particle.rotationAndMeta.w;
  const launchDelay = particle.originAndTiming.w;
  const origin = particle.originAndTiming.xy;
  const velocity = particle.velocityAndDepth.xy;
  const safeHDrag = std.max(u.drag.x, 0.001);
  const safeVDrag = std.max(u.drag.y, 0.001);

  let center = d.vec2f(origin);
  let effectiveProgress = d.f32(0);
  let rotationProgress = d.f32(0);
  let visibility = d.f32(1);

  if (mode < 0.5) {
    const elapsedMs = u.progress * u.totalDuration;
    const localMs = elapsedMs - particle.originAndTiming.z;
    const localProgress = std.clamp(
      localMs / std.max(u.flightDuration, 1),
      0,
      1
    );
    rotationProgress = localProgress;
    effectiveProgress = std.clamp(
      (localProgress - launchDelay) / std.max(1 - launchDelay, 0.0001),
      0,
      1
    );
    visibility = std.select(d.f32(0), d.f32(1), localMs > 0);

    const t = effectiveProgress * (u.flightDuration / 1000);
    const hExpDecay = 1 - std.exp(-safeHDrag * t);
    const vExpDecay = 1 - std.exp(-safeVDrag * t);
    center = d.vec2f(
      origin.x + (velocity.x / safeHDrag) * hExpDecay,
      origin.y +
        (u.gravity / safeVDrag) * t +
        ((velocity.y - u.gravity / safeVDrag) / safeVDrag) * vExpDecay
    );
  } else {
    effectiveProgress = std.clamp(
      (u.progress - launchDelay) / std.max(1 - launchDelay, 0.0001),
      0,
      1
    );
    rotationProgress = u.progress;

    const totalTime = u.totalDuration / 1000;
    const t = effectiveProgress * totalTime;
    const normalizedT = std.min(t / std.max(totalTime, 0.0001), 1);
    const hDecayFactor = 1 - std.pow(1 - normalizedT, safeHDrag + 1);
    const vExpDecay = 1 - std.exp(-safeVDrag * t);
    center = d.vec2f(
      origin.x + ((velocity.x * totalTime) / (safeHDrag + 1)) * hDecayFactor,
      origin.y +
        (u.gravity / safeVDrag) * t +
        ((velocity.y - u.gravity / safeVDrag) / safeVDrag) * vExpDecay
    );
  }

  const rotationDir = particle.rotationAndMeta.z;
  const rz =
    particle.velocityAndDepth.w +
    rotationProgress * rotationDir * particle.rotationAndMeta.y;
  const rx =
    particle.velocityAndDepth.w +
    rotationProgress * rotationDir * particle.rotationAndMeta.x;

  const minFlipScale = std.clamp(1 - u.flipIntensity, 0, 1);
  const rawCos = std.cos(rx);
  const absClamped = std.max(std.abs(rawCos), minFlipScale);
  const signedScale = std.select(-absClamped, absClamped, rawCos >= 0);
  const isTextured = particle.indices.z > 0.5;
  const oscillatingScale = std.select(signedScale, absClamped, isTextured);
  const appearT = std.clamp(effectiveProgress / 0.05, 0, 1);
  const appearScale = u.initialScale + (1 - u.initialScale) * appearT;
  const scale = appearScale * oscillatingScale * particle.velocityAndDepth.z;

  const local = (uv - d.vec2f(0.5)) * d.vec2f(width, height);
  const s = std.sin(rz) * scale;
  const c = std.cos(rz) * scale;
  const screen = center + d.vec2f(c * local.x - s * local.y, s * local.x + c * local.y);
  const clip = toClip(screen);

  return {
    position: d.vec4f(clip, 0, 1),
    uv: d.vec2f(uv.x, 1 - uv.y),
    color: d.vec4f(
      burstRenderLayout.$.palette[colorIdx]!.rgb,
      u.opacity * visibility
    ),
    sizeAndRadius: d.vec3f(width, height, radius),
    flagsAndLayer: d.vec2f(flags, textureLayer),
  };
});

export const burstConfettiFragment = tgpu.fragmentFn({
  in: VertexOut,
  out: d.vec4f,
})((input) => {
  'use gpu';

  const flags = d.u32(input.flagsAndLayer.x);
  const isGlossy = (flags & 1) !== 0;
  const isTextured = (flags & 2) !== 0;

  const flakeSize = input.sizeAndRadius.xy;
  const radius = input.sizeAndRadius.z;
  const p = (input.uv - d.vec2f(0.5)) * flakeSize;
  const dist = sdfRoundedBoxPx(p, flakeSize * 0.5, radius);
  const radiusActive = std.step(0.01, radius);
  const aa = std.max(std.fwidth(dist), 0.5);
  const insideMask = 1 - std.smoothstep(-aa, aa, dist);
  const maskAlpha = std.mix(1, insideMask, radiusActive);

  const texColor = std.textureSample(
    burstRenderLayout.$.textures,
    burstRenderLayout.$.sampler,
    input.uv,
    d.i32(input.flagsAndLayer.y)
  );
  const paletteRgb = input.color.rgb;
  const texAlpha = std.select(d.f32(1), texColor.a, isTextured);

  let outputColor = d.vec3f(paletteRgb);
  if (isTextured) {
    outputColor = d.vec3f(texColor.rgb);
  } else if (isGlossy) {
    const lighter = paletteRgb + (d.vec3f(1) - paletteRgb) * 0.35;
    outputColor = std.mix(lighter, paletteRgb, std.clamp(input.uv.y / 0.6, 0, 1));
  }

  return d.vec4f(outputColor, input.color.a * maskAlpha * texAlpha);
});

export type BurstConfettiPipelines = {
  renderPipeline: TgpuRenderPipeline;
};

export const createBurstConfettiPipelines = (
  root: TgpuRoot,
  presentationFormat: GPUTextureFormat
): BurstConfettiPipelines => ({
  renderPipeline: root.createRenderPipeline({
    vertex: burstConfettiVertex,
    fragment: burstConfettiFragment,
    targets: {
      format: presentationFormat,
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
    },
    primitive: {
      topology: 'triangle-list',
    },
  }),
});
