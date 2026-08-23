import {
  d,
  std,
  tgpu,
  type TgpuComputePipeline,
  type TgpuRenderPipeline,
  type TgpuRoot,
} from 'typegpu';
import {
  InitSizeSchema,
  gpuRandom01,
  gpuRandomRange,
} from './confetti';

export const BURST_VERTS_PER_FLAKE = 6;
const SIZE_FLAG_TEXTURED = 1 << 1;
const SIZE_FLAG_SHAPE_MASK = 1 << 2;
const SIZE_FLAG_TEXTURE_LAYER_SHIFT = 8;
const SIZE_FLAG_MASK_LAYER_SHIFT = 16;
const SIZE_FLAG_LAYER_MASK = 0xff;

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

export const BurstInitUniformsSchema = d.struct({
  counts: d.vec4u,
  globals: d.vec4f,
});

export const BurstOriginSchema = d.struct({
  originAndCount: d.vec4f,
  targetStartAndMode: d.vec4f,
  motion: d.vec4f,
  selection: d.vec4f,
  rotation: d.vec4f,
  depth: d.vec4f,
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
export const BurstOriginArraySchema = (count: number) =>
  d.arrayOf(BurstOriginSchema, count);
export const BurstInitSizeArraySchema = (count: number) =>
  d.arrayOf(InitSizeSchema, count);

export const burstInitLayout = tgpu
  .bindGroupLayout({
    uniforms: {
      uniform: BurstInitUniformsSchema,
      visibility: ['compute'],
    },
    particles: {
      storage: d.arrayOf(BurstParticleSchema),
      access: 'mutable',
      visibility: ['compute'],
    },
    origins: {
      storage: d.arrayOf(BurstOriginSchema),
      access: 'readonly',
      visibility: ['compute'],
    },
    sizes: {
      storage: d.arrayOf(InitSizeSchema),
      access: 'readonly',
      visibility: ['compute'],
    },
  })
  .$idx(0);

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
    shapeMasks: {
      texture: d.texture2dArray(d.f32),
      sampleType: 'float',
      visibility: ['fragment'],
    },
  })
  .$idx(0);

export const burstConfettiInit = tgpu.computeFn({
  in: {
    gid: d.builtin.globalInvocationId,
  },
  workgroupSize: [64],
})(({ gid }) => {
  'use gpu';

  const idx = gid.x;
  const count = std.arrayLength(burstInitLayout.$.particles);
  if (idx >= count) {
    return;
  }

  const u = burstInitLayout.$.uniforms;
  const seed = u.counts.x;
  const layoutCount = std.max(u.counts.y, d.u32(1));
  const originCount = std.max(u.counts.z, d.u32(1));
  const layoutIndex = d.u32(
    std.div(
      (idx + d.u32(1)) * layoutCount + count - d.u32(1),
      count
    ) - 1
  );

  let low = d.u32(0);
  let high = originCount;
  for (const step of std.range(16)) {
    if (step < 16 && low < high) {
      const mid = d.u32(std.floor((d.f32(low) + d.f32(high)) * 0.5));
      const candidate = burstInitLayout.$.origins[mid]!;
      const start = d.u32(candidate.targetStartAndMode.z);
      const end = start + d.u32(candidate.originAndCount.w);
      if (layoutIndex < start) {
        high = mid;
      } else if (layoutIndex >= end) {
        low = mid + d.u32(1);
      } else {
        low = mid;
        high = mid;
      }
    }
  }

  const originIndex = std.min(low, originCount - d.u32(1));
  const origin = burstInitLayout.$.origins[originIndex]!;
  const originStart = d.u32(origin.targetStartAndMode.z);
  const localIndex = layoutIndex - originStart;
  const mode = origin.targetStartAndMode.w;
  const halfSpread = origin.motion.x * 0.5;

  let angle = d.f32(0);
  if (mode < 0.5) {
    const turns = d.f32(localIndex) * (137.5 / 360);
    const centeredDegrees = std.fract(turns) * 360 - 180;
    angle =
      -1.57079632679 +
      centeredDegrees * (halfSpread / 180);
  } else {
    const targetDelta =
      origin.targetStartAndMode.xy - origin.originAndCount.xy;
    const baseAngle = std.atan2(targetDelta.y, targetDelta.x);
    angle =
      baseAngle +
      gpuRandomRange(
        layoutIndex,
        d.u32(0),
        seed,
        -halfSpread,
        halfSpread
      );
  }

  const speedMultiplier = gpuRandomRange(
    layoutIndex,
    d.u32(1),
    seed,
    origin.motion.z,
    origin.motion.w
  );
  const depthScale = gpuRandomRange(
    layoutIndex,
    d.u32(2),
    seed,
    origin.depth.x,
    origin.depth.y
  );
  const speed =
    origin.motion.y * u.globals.x * speedMultiplier * depthScale;
  const velocity = d.vec2f(speed * std.cos(angle), speed * std.sin(angle));
  const launchDelay = gpuRandomRange(
    layoutIndex,
    d.u32(3),
    seed,
    0,
    u.globals.y
  );
  const maxRotationX = gpuRandomRange(
    layoutIndex,
    d.u32(4),
    seed,
    origin.rotation.x,
    origin.rotation.y
  );
  const maxRotationZ = gpuRandomRange(
    layoutIndex,
    d.u32(5),
    seed,
    origin.rotation.z,
    origin.rotation.w
  );
  const rotationDirection = std.select(
    d.f32(-1),
    d.f32(1),
    gpuRandom01(layoutIndex, d.u32(6), seed) >= 0.5
  );
  const initialRotation = gpuRandomRange(
    layoutIndex,
    d.u32(7),
    seed,
    0.31415926535,
    3.14159265359
  );

  const sizeStart = d.u32(std.max(origin.selection.z, 0));
  const sizeCount = d.u32(std.max(origin.selection.w, 1));
  const sizeIndex =
    sizeStart +
    std.min(
      d.u32(
        std.round(
          gpuRandom01(layoutIndex, d.u32(8), seed) *
            d.f32(sizeCount - d.u32(1))
        )
      ),
      sizeCount - d.u32(1)
    );
  const sizeSelection = burstInitLayout.$.sizes[sizeIndex]!.selection;
  const colorStart = d.u32(std.max(sizeSelection.x, 0));
  const colorCount = d.u32(std.max(sizeSelection.y, 1));
  const colorIndex =
    colorStart +
    std.min(
      d.u32(
        std.round(
          gpuRandom01(layoutIndex, d.u32(9), seed) *
            d.f32(colorCount - d.u32(1))
        )
      ),
      colorCount - d.u32(1)
    );
  const sizeFlags = d.u32(sizeSelection.z);
  const isTextured = std.select(
    d.f32(0),
    d.f32(1),
    (sizeFlags & d.u32(SIZE_FLAG_TEXTURED)) !== d.u32(0)
  );

  burstInitLayout.$.particles[idx] = BurstParticleSchema({
    originAndTiming: d.vec4f(
      origin.originAndCount.xy,
      std.select(d.f32(0), origin.originAndCount.z, mode < 0.5),
      launchDelay
    ),
    velocityAndDepth: d.vec4f(
      velocity,
      depthScale,
      initialRotation
    ),
    rotationAndMeta: d.vec4f(
      maxRotationX,
      maxRotationZ,
      rotationDirection,
      mode
    ),
    indices: d.vec4f(
      d.f32(sizeIndex),
      d.f32(colorIndex),
      isTextured,
      std.select(d.f32(originIndex), speedMultiplier, mode < 0.5)
    ),
  });
});

const toClip = tgpu.fn([d.vec2f], d.vec2f)((screen) => {
  'use gpu';

  const u = burstRenderLayout.$.uniforms;
  return d.vec2f(
    (screen.x / u.viewport.x) * 2 - 1,
    1 - (screen.y / u.viewport.y) * 2
  );
});

const VertexOut = {
  position: d.builtin.position,
  uv: d.location(0, d.vec2f),
  color: d.location(1, d.vec4f),
  flagsAndLayers: d.location(2, d.vec3f),
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
  const flags = size.dims.w;
  const flagsU = d.u32(flags);
  const textureLayer = d.f32(
    std.bitShiftRight(flagsU, d.u32(SIZE_FLAG_TEXTURE_LAYER_SHIFT)) &
      d.u32(SIZE_FLAG_LAYER_MASK)
  );
  const maskLayer = d.f32(
    std.bitShiftRight(flagsU, d.u32(SIZE_FLAG_MASK_LAYER_SHIFT)) &
      d.u32(SIZE_FLAG_LAYER_MASK)
  );

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
    flagsAndLayers: d.vec3f(flags, textureLayer, maskLayer),
  };
});

export const burstConfettiFragment = tgpu.fragmentFn({
  in: VertexOut,
  out: d.vec4f,
})((input) => {
  'use gpu';

  const flags = d.u32(input.flagsAndLayers.x);
  const isGlossy = (flags & 1) !== 0;
  const isTextured = (flags & d.u32(SIZE_FLAG_TEXTURED)) !== 0;
  const hasShapeMask = (flags & d.u32(SIZE_FLAG_SHAPE_MASK)) !== 0;

  let texColor = d.vec4f(1);
  if (isTextured) {
    texColor = std.textureSampleLevel(
      burstRenderLayout.$.textures,
      burstRenderLayout.$.sampler,
      input.uv,
      d.i32(input.flagsAndLayers.y),
      0
    );
  }
  let maskAlpha = d.f32(1);
  if (hasShapeMask) {
    maskAlpha = std.textureSampleLevel(
      burstRenderLayout.$.shapeMasks,
      burstRenderLayout.$.sampler,
      input.uv,
      d.i32(input.flagsAndLayers.z),
      0
    ).r;
  }
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

export const burstTextureFragment = tgpu.fragmentFn({
  in: VertexOut,
  out: d.vec4f,
})((input) => {
  'use gpu';

  const texColor = std.textureSampleLevel(
    burstRenderLayout.$.textures,
    burstRenderLayout.$.sampler,
    input.uv,
    d.i32(input.flagsAndLayers.y),
    0
  );
  return d.vec4f(texColor.rgb, input.color.a * texColor.a);
});

export type BurstConfettiPipelines = {
  initPipeline: TgpuComputePipeline;
  renderPipeline: TgpuRenderPipeline;
};

export const createBurstConfettiPipelines = (
  root: TgpuRoot,
  presentationFormat: GPUTextureFormat,
  useTexturePipeline: boolean
): BurstConfettiPipelines => ({
  initPipeline: root.createComputePipeline({
    compute: burstConfettiInit,
  }),
  renderPipeline: root.createRenderPipeline({
    vertex: burstConfettiVertex,
    fragment: useTexturePipeline ? burstTextureFragment : burstConfettiFragment,
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
