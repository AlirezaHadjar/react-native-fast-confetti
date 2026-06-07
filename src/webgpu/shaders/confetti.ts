import {
  d,
  std,
  tgpu,
  type TgpuComputePipeline,
  type TgpuRenderPipeline,
  type TgpuRoot,
} from 'typegpu';

export const TESS = 6;
export const VERTS_PER_FLAKE = TESS * TESS * 6;

export const UniformsSchema = d.struct({
  viewport: d.vec2f,
  focalLength: d.f32,
  opacity: d.f32,

  dt: d.f32,
  time: d.f32,
  drift: d.f32,
  initialScale: d.f32,

  windStrength: d.f32,
  magnusStrength: d.f32,
  continuous: d.f32,
  infinite: d.f32,

  progress: d.f32,
  cycleCount: d.f32,
  cycleDuration: d.f32,
  fadeOutOnEnd: d.f32,

  fadeStart: d.f32,
  bounceRestitution: d.f32,
  floorFriction: d.f32,
  motionBlurAmount: d.f32,

  shadowOpacity: d.f32,
  iridescence: d.f32,
  gravityMag: d.f32,
  textureMode: d.f32,

  lightDir: d.vec3f,
  minVisibleScale: d.f32,

  gravityDir: d.vec3f,
  _pad2: d.f32,
});

export const SpawnSchema = d.struct({
  pos0: d.vec3f,
  vel0: d.vec3f,
  quat0: d.vec4f,
  omega0: d.vec3f,
  drag: d.vec4f,
  info: d.vec4f,
});

export const RuntimeSchema = d.struct({
  pos: d.vec3f,
  life: d.f32,
  vel: d.vec3f,
  quat: d.vec4f,
  omega: d.vec3f,
});

export const SizeSchema = d.struct({
  dims: d.vec4f,
});

export const PaletteColorSchema = d.vec4f;

export const SPAWN_BYTES = d.sizeOf(SpawnSchema);
export const RUNTIME_BYTES = d.sizeOf(RuntimeSchema);
export const SIZE_META_BYTES = d.sizeOf(SizeSchema);
export const UNIFORMS_BYTES = d.sizeOf(UniformsSchema);

export const ComputeSpawnsSchema = (count: number) =>
  d.arrayOf(SpawnSchema, count);
export const RuntimeArraySchema = (count: number) =>
  d.arrayOf(RuntimeSchema, count);
export const SizeArraySchema = (count: number) => d.arrayOf(SizeSchema, count);
export const PaletteArraySchema = (count: number) =>
  d.arrayOf(PaletteColorSchema, count);

export const computeLayout = tgpu
  .bindGroupLayout({
    uniforms: {
      uniform: UniformsSchema,
      visibility: ['compute'],
    },
    spawns: {
      storage: d.arrayOf(SpawnSchema),
      access: 'readonly',
      visibility: ['compute'],
    },
    runtime: {
      storage: d.arrayOf(RuntimeSchema),
      access: 'mutable',
      visibility: ['compute'],
    },
  })
  .$idx(0);

export const renderLayout = tgpu
  .bindGroupLayout({
    uniforms: {
      uniform: UniformsSchema,
      visibility: ['vertex', 'fragment'],
    },
    spawns: {
      storage: d.arrayOf(SpawnSchema),
      access: 'readonly',
      visibility: ['vertex'],
    },
    runtime: {
      storage: d.arrayOf(RuntimeSchema),
      access: 'readonly',
      visibility: ['vertex'],
    },
    sizes: {
      storage: d.arrayOf(SizeSchema),
      access: 'readonly',
      visibility: ['vertex'],
    },
    palette: {
      storage: d.arrayOf(PaletteColorSchema),
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

const qMul = tgpu.fn([d.vec4f, d.vec4f], d.vec4f)((a, b) => {
  'use gpu';

  return d.vec4f(
    a.w * b.xyz + b.w * a.xyz + std.cross(a.xyz, b.xyz),
    a.w * b.w - std.dot(a.xyz, b.xyz)
  );
});

const qConj = tgpu.fn([d.vec4f], d.vec4f)((q) => {
  'use gpu';

  return d.vec4f(-q.x, -q.y, -q.z, q.w);
});

const qRot = tgpu.fn([d.vec4f, d.vec3f], d.vec3f)((q, v) => {
  'use gpu';

  const u = q.xyz;
  return (
    2 * std.dot(u, v) * u +
    (q.w * q.w - std.dot(u, u)) * v +
    2 * q.w * std.cross(u, v)
  );
});

const qIntegrate = tgpu.fn([d.vec4f, d.vec3f, d.f32], d.vec4f)(
  (q, omegaWorld, dt) => {
    'use gpu';

    const wq = d.vec4f(omegaWorld.x, omegaWorld.y, omegaWorld.z, 0);
    const dq = 0.5 * dt * qMul(wq, q);
    return std.normalize(q + dq);
  }
);

const hash13 = tgpu.fn([d.vec3f], d.f32)((p) => {
  'use gpu';

  let q = std.fract(p * 0.1031);
  q = q + std.dot(q, q.zyx + 31.32);
  return std.fract((q.x + q.y) * q.z);
});

const vnoise3 = tgpu.fn([d.vec3f], d.f32)((x) => {
  'use gpu';

  const i = std.floor(x);
  const f = std.fract(x);
  const w = f * f * (3 - 2 * f);
  const a = std.mix(
    hash13(i + d.vec3f(0, 0, 0)),
    hash13(i + d.vec3f(1, 0, 0)),
    w.x
  );
  const b = std.mix(
    hash13(i + d.vec3f(0, 1, 0)),
    hash13(i + d.vec3f(1, 1, 0)),
    w.x
  );
  const c = std.mix(
    hash13(i + d.vec3f(0, 0, 1)),
    hash13(i + d.vec3f(1, 0, 1)),
    w.x
  );
  const d0 = std.mix(
    hash13(i + d.vec3f(0, 1, 1)),
    hash13(i + d.vec3f(1, 1, 1)),
    w.x
  );
  return std.mix(std.mix(a, b, w.y), std.mix(c, d0, w.y), w.z);
});

const windField = tgpu.fn([d.vec3f, d.f32], d.vec3f)((p, t) => {
  'use gpu';

  const scale = d.vec3f(0.006, 0.006, 0.01);
  const tv = d.vec3f(t * 0.25);
  const eps = 1;
  const q = p * scale + tv;
  const dY =
    vnoise3(q + d.vec3f(0, eps, 0)) - vnoise3(q - d.vec3f(0, eps, 0));
  const dX =
    vnoise3(q + d.vec3f(eps, 0, 0)) - vnoise3(q - d.vec3f(eps, 0, 0));
  const dZ =
    vnoise3(q + d.vec3f(0, 0, eps)) - vnoise3(q - d.vec3f(0, 0, eps));
  return d.vec3f(dY, -dX * 0.5, dZ) * 180;
});

const project = tgpu.fn([d.vec3f], d.vec2f)((p) => {
  'use gpu';

  const u = renderLayout.$.uniforms;
  const cx = u.viewport.x * 0.5;
  const cy = u.viewport.y * 0.5;
  const zRel = std.max(p.z + u.focalLength, 1);
  return d.vec2f(
    cx + (p.x - cx) * (u.focalLength / zRel),
    cy + (p.y - cy) * (u.focalLength / zRel)
  );
});

const toClip = tgpu.fn([d.vec2f], d.vec2f)((screen) => {
  'use gpu';

  const u = renderLayout.$.uniforms;
  return d.vec2f(
    (screen.x / u.viewport.x) * 2 - 1,
    1 - (screen.y / u.viewport.y) * 2
  );
});

const normalizeOr2 = tgpu.fn([d.vec2f, d.vec2f], d.vec2f)((v, fallback) => {
  'use gpu';

  const len = std.length(v);
  return d.vec2f(
    std.select(fallback, v / std.max(len, 0.0001), len > 0.0001)
  );
});

const clampAxis = tgpu.fn([d.vec2f, d.vec2f, d.f32], d.vec2f)(
  (axis, fallback, minLen) => {
    'use gpu';

    const dir = normalizeOr2(axis, fallback);
    return dir * std.max(std.length(axis), minLen);
  }
);

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

const hash12 = tgpu.fn([d.vec2f], d.f32)((p) => {
  'use gpu';

  let q = std.fract(p * d.vec2f(123.34, 345.45));
  q = q + std.dot(q, q + 34.345);
  return std.fract(q.x * q.y);
});

const vnoise2 = tgpu.fn([d.vec2f], d.f32)((x) => {
  'use gpu';

  const i = std.floor(x);
  const f = std.fract(x);
  const w = f * f * (3 - 2 * f);
  const a = std.mix(
    hash12(i + d.vec2f(0, 0)),
    hash12(i + d.vec2f(1, 0)),
    w.x
  );
  const b = std.mix(
    hash12(i + d.vec2f(0, 1)),
    hash12(i + d.vec2f(1, 1)),
    w.x
  );
  return std.mix(a, b, w.y);
});

const fbm = tgpu.fn([d.vec2f], d.f32)((x) => {
  'use gpu';

  let amp = d.f32(0.5);
  let freq = d.f32(1);
  let sum = d.f32(0);
  for (const octave of std.range(3)) {
    sum = sum + amp * vnoise2(x * freq);
    amp = amp * 0.5;
    freq = freq * (2.1 + d.f32(octave) * 0);
  }
  return sum;
});

const pick3 = tgpu.fn(
  [d.f32, d.vec3f, d.vec3f, d.vec3f],
  d.vec3f
)((seed, a, b, c) => {
  'use gpu';

  const t = std.fract(seed * 7.919);
  if (t < 0.333) {
    return d.vec3f(a);
  }
  if (t < 0.666) {
    return d.vec3f(b);
  }
  return d.vec3f(c);
});

const pick4 = tgpu.fn(
  [d.f32, d.vec3f, d.vec3f, d.vec3f, d.vec3f],
  d.vec3f
)((seed, a, b, c, e) => {
  'use gpu';

  const t = std.fract(seed * 13.37);
  if (t < 0.25) {
    return d.vec3f(a);
  }
  if (t < 0.5) {
    return d.vec3f(b);
  }
  if (t < 0.75) {
    return d.vec3f(c);
  }
  return d.vec3f(e);
});

export const confettiCompute = tgpu.computeFn({
  in: {
    gid: d.builtin.globalInvocationId,
  },
  workgroupSize: [64],
})(({ gid }) => {
  'use gpu';

  const idx = gid.x;
  if (idx >= std.arrayLength(computeLayout.$.runtime)) {
    return;
  }

  const u = computeLayout.$.uniforms;
  const spawn = computeLayout.$.spawns[idx]!;
  let rt = RuntimeSchema(computeLayout.$.runtime[idx]!);

  rt.life += u.dt;
  if (rt.life < 0) {
    computeLayout.$.runtime[idx] = RuntimeSchema(rt);
    return;
  }

  const Cn = spawn.drag.x;
  const Ct = spawn.drag.y;
  const Crot = spawn.drag.z;
  const magnusK = spawn.drag.w;

  const qConjOrient = qConj(rt.quat);
  const vBody = qRot(qConjOrient, rt.vel);
  const fBody = d.vec3f(
    -Cn * vBody.x * std.abs(vBody.x),
    -Cn * vBody.y * std.abs(vBody.y),
    -Ct * vBody.z * std.abs(vBody.z)
  );
  const fDrag = qRot(rt.quat, fBody);

  const fMagnus = magnusK * u.magnusStrength * std.cross(rt.omega, rt.vel);
  const fWind = windField(rt.pos, u.time) * u.windStrength;
  const fGravity = u.gravityDir * u.gravityMag;
  const accel = fGravity + fDrag + fMagnus + fWind;

  let newVel = rt.vel + accel * u.dt;
  const vMag = std.length(newVel);
  const vMax = u.gravityMag * 1.5;
  if (vMag > vMax) {
    newVel = newVel * (vMax / vMag);
  }
  rt.vel = d.vec3f(newVel);
  rt.pos = d.vec3f(rt.pos + rt.vel * u.dt);

  const omega0Len = std.length(spawn.omega0);
  const tumbleAxis = std.select(
    d.vec3f(1, 0, 0),
    spawn.omega0 / std.max(omega0Len, 0.0001),
    omega0Len > 0.0001
  );
  const tumbleBias = tumbleAxis * omega0Len * omega0Len * Crot;
  const damping = -Crot * rt.omega * std.length(rt.omega);
  let newOmega = rt.omega + (tumbleBias + damping) * u.dt;
  const wMag = std.length(newOmega);
  const wMax = std.max(omega0Len * 1.5, 25);
  if (wMag > wMax) {
    newOmega = newOmega * (wMax / wMag);
  }
  rt.omega = d.vec3f(newOmega);
  rt.quat = d.vec4f(qIntegrate(rt.quat, rt.omega, u.dt));

  computeLayout.$.runtime[idx] = RuntimeSchema(rt);
});

const VertexOut = {
  position: d.builtin.position,
  uv: d.location(0, d.vec2f),
  color: d.location(1, d.vec4f),
  normal: d.location(2, d.vec3f),
  sizeAndRadius: d.location(3, d.vec3f),
  flagsAndLayer: d.location(4, d.vec2f),
  seedAndRim: d.location(5, d.vec2f),
};

export const confettiVertex = tgpu.vertexFn({
  in: {
    vertexIndex: d.builtin.vertexIndex,
    instanceIndex: d.builtin.instanceIndex,
  },
  out: VertexOut,
})(({ vertexIndex, instanceIndex }) => {
  'use gpu';

  const u = renderLayout.$.uniforms;
  const tess = d.u32(TESS);
  const cellIdx = d.u32(vertexIndex / 6);
  const vertInCell = vertexIndex % 6;
  const cellX = cellIdx % tess;
  const cellY = d.u32(cellIdx / tess);

  let off = d.vec2f(0);
  if (vertInCell === 0) {
    off = d.vec2f(0, 0);
  } else if (vertInCell === 1) {
    off = d.vec2f(1, 0);
  } else if (vertInCell === 2) {
    off = d.vec2f(1, 1);
  } else if (vertInCell === 3) {
    off = d.vec2f(0, 0);
  } else if (vertInCell === 4) {
    off = d.vec2f(1, 1);
  } else {
    off = d.vec2f(0, 1);
  }

  const u0 = (d.f32(cellX) + off.x) / TESS;
  const v0 = (d.f32(cellY) + off.y) / TESS;

  const spawn = renderLayout.$.spawns[instanceIndex]!;
  const rt = renderLayout.$.runtime[instanceIndex]!;
  const sizeIdx = d.u32(spawn.info.x);
  const colorIdx = d.u32(spawn.info.y);
  const size = renderLayout.$.sizes[sizeIdx]!;
  const width = size.dims.x;
  const height = size.dims.y;
  const radius = size.dims.z;
  const flags = size.dims.w;
  const textureLayer = d.f32(std.bitShiftRight(d.u32(flags), d.u32(16)));

  const appearWindow = std.max(u.cycleDuration * 0.05, 0.0001);
  const appearT = std.select(
    std.clamp(rt.life / appearWindow, 0, 1),
    d.f32(1),
    u.continuous > 0.5
  );
  const appearScale = u.initialScale + (1 - u.initialScale) * appearT;

  const speed = std.length(rt.vel);
  const minSide = std.min(width, height);
  const phase = rt.life * 4.5 + spawn.info.w * 6.28318;
  const bendAmp = minSide * (0.12 + 0.25 * std.clamp(speed / 600, 0, 1));
  const baseAmp = std.select(bendAmp, d.f32(0), u.textureMode < 0.5);
  const sU = std.sin(u0 * 6.28318 + phase);
  const cU = std.cos(u0 * 6.28318 + phase);
  const sV = std.sin(v0 * 3.14159);
  const cV = std.cos(v0 * 3.14159);
  const zBend = baseAmp * sU * sV;

  const dzdu = baseAmp * 6.28318 * cU * sV;
  const dzdv = baseAmp * 3.14159 * sU * cV;
  const dzdx = dzdu / std.max(width, 0.0001);
  const dzdy = dzdv / std.max(height, 0.0001);
  const nBody = std.normalize(d.vec3f(-dzdx, -dzdy, 1));

  const lateralDamp = std.mix(0, 1, u.drift);
  let centerWorld = d.vec3f(rt.pos);
  centerWorld.x = spawn.pos0.x + (centerWorld.x - spawn.pos0.x) * lateralDamp;

  const centerScreen = project(centerWorld);
  const perspectiveScale = u.focalLength / std.max(centerWorld.z + u.focalLength, 1);

  const axisXWorld = qRot(
    rt.quat,
    d.vec3f(width * 0.5 * appearScale, 0, 0)
  );
  const axisYWorld = qRot(
    rt.quat,
    d.vec3f(0, height * 0.5 * appearScale, 0)
  );
  const axisZWorld = qRot(rt.quat, d.vec3f(0, 0, zBend * appearScale));

  let axisXScreen = project(centerWorld + axisXWorld) - centerScreen;
  let axisYScreen = project(centerWorld + axisYWorld) - centerScreen;
  const bendScreen = project(centerWorld + axisZWorld) - centerScreen;

  const yDir0 = normalizeOr2(axisYScreen, d.vec2f(0, 1));
  const xFallback = d.vec2f(-yDir0.y, yDir0.x);
  const minVisibleScale = std.clamp(u.minVisibleScale, 0, 1);
  axisXScreen = clampAxis(
    axisXScreen,
    xFallback,
    width * 0.5 * appearScale * perspectiveScale * minVisibleScale
  );
  const xDir = normalizeOr2(axisXScreen, d.vec2f(1, 0));
  axisYScreen = clampAxis(
    axisYScreen,
    d.vec2f(-xDir.y, xDir.x),
    height * 0.5 * appearScale * perspectiveScale * minVisibleScale
  );

  let screen =
    centerScreen +
    axisXScreen * ((u0 - 0.5) * 2) +
    axisYScreen * ((v0 - 0.5) * 2) +
    bendScreen;

  if (u.motionBlurAmount > 0.001 && speed > 1) {
    const velDir = rt.vel / speed;
    const stretch = ((u.motionBlurAmount * std.min(speed, 1200)) / 1200) * 0.6;
    const blurWorld = centerWorld + velDir * ((v0 - 0.5) * height * stretch);
    screen = screen + (project(blurWorld) - centerScreen);
  }

  const clip = toClip(screen);
  const N = qRot(rt.quat, nBody);
  const V = d.vec3f(0, 0, -1);
  const rim = 1 - std.abs(std.dot(std.normalize(N), V));
  const iSeed = std.fract(std.sin(d.f32(instanceIndex) * 12.9898) * 43758.5453);

  return {
    position: d.vec4f(clip, 0, 1),
    uv: d.vec2f(u0, 1 - v0),
    color: d.vec4f(renderLayout.$.palette[colorIdx]!.rgb, u.opacity),
    normal: N,
    sizeAndRadius: d.vec3f(width, height, radius),
    flagsAndLayer: d.vec2f(flags, textureLayer),
    seedAndRim: d.vec2f(iSeed, rim),
  };
});

export const confettiFragment = tgpu.fragmentFn({
  in: VertexOut,
  out: d.vec4f,
})((input) => {
  'use gpu';

  const u = renderLayout.$.uniforms;
  const flags = d.u32(input.flagsAndLayer.x);
  const isGlossy = (flags & 1) !== 0;
  const isTextured = (flags & 2) !== 0;
  const rim = input.seedAndRim.y;
  const seed = input.seedAndRim.x;
  const mode = d.u32(u.textureMode);

  const flakeSize = input.sizeAndRadius.xy;
  const radius = input.sizeAndRadius.z;
  const p = (input.uv - d.vec2f(0.5)) * flakeSize;
  const dist = sdfRoundedBoxPx(p, flakeSize * 0.5, radius);
  const radiusActive = std.step(0.01, radius);
  const aa = std.max(std.fwidth(dist), 0.5);
  const insideMask = 1 - std.smoothstep(-aa, aa, dist);
  const maskAlpha = std.mix(1, insideMask, radiusActive);

  const texColor = std.textureSample(
    renderLayout.$.textures,
    renderLayout.$.sampler,
    input.uv,
    d.i32(input.flagsAndLayer.y)
  );
  const paletteRgb = input.color.rgb;
  const texAlpha = std.select(d.f32(1), texColor.a, isTextured);

  if (mode === 0) {
    let skiaColor = d.vec3f(paletteRgb);
    if (isTextured) {
      skiaColor = d.vec3f(texColor.rgb);
    } else if (isGlossy) {
      const lighter = paletteRgb + (d.vec3f(1) - paletteRgb) * 0.35;
      skiaColor = std.mix(lighter, paletteRgb, std.clamp(input.uv.y / 0.6, 0, 1));
    }

    const finalAlpha = input.color.a * maskAlpha * texAlpha;
    return d.vec4f(skiaColor, finalAlpha);
  }

  const Nbase = std.normalize(input.normal);
  const tUp = std.select(
    d.vec3f(0, 1, 0),
    d.vec3f(1, 0, 0),
    std.abs(Nbase.y) > 0.9
  );
  const tang = std.normalize(std.cross(tUp, Nbase));
  const bitan = std.cross(Nbase, tang);

  const L = std.normalize(u.lightDir);
  const V = d.vec3f(0, 0, -1);
  const H = std.normalize(L + V);

  let base = d.vec3f(paletteRgb);
  let nDelta = d.vec2f(0);
  let specExp = d.f32(12);
  let specK = d.f32(0.3);
  let ambient = d.f32(0.32);
  let iridAmount = u.iridescence * 0.5;
  let emissive = d.vec3f(0);
  let alphaMul = d.f32(1);
  let rimBoost = d.f32(0);

  if (isTextured) {
    base = d.vec3f(texColor.rgb);
    specExp = 24;
    specK = 0.35;
  } else if (mode === 1) {
    const grainDir = d.vec2f(input.uv.x * 0.22, input.uv.y * 1.4);
    const turb = fbm(grainDir * 3) * 0.5 + fbm(grainDir * 12) * 0.15;
    const rings = 0.5 + 0.5 * std.sin(grainDir.x * 28 + turb * 6);
    const grainMask = std.pow(rings, 1.8);
    const knot = std.smoothstep(0.72, 0.88, fbm(input.uv * 5));
    const eps = 1 / 96;
    const gx =
      (fbm(grainDir * 12 + d.vec2f(eps, 0)) -
        fbm(grainDir * 12 - d.vec2f(eps, 0))) *
      0.8;
    const gy =
      (fbm(grainDir * 12 + d.vec2f(0, eps)) -
        fbm(grainDir * 12 - d.vec2f(0, eps))) *
      0.3;
    nDelta = d.vec2f(gx, gy) * 0.35;

    const walnut = d.vec3f(0.26, 0.16, 0.09);
    const oak = d.vec3f(0.55, 0.38, 0.22);
    const cherry = d.vec3f(0.48, 0.22, 0.15);
    const tinted = pick3(seed, walnut, oak, cherry);
    const shaded = tinted * (0.55 + grainMask * 0.55);
    base = std.mix(shaded, tinted * 0.18, knot);
    specExp = 10;
    specK = 0.15;
    ambient = 0.3;
    iridAmount = 0;
  } else if (mode === 2) {
    const n = fbm(input.uv * 18);
    const epsR = 1 / 64;
    const rx =
      (fbm(input.uv * 18 + d.vec2f(epsR, 0)) -
        fbm(input.uv * 18 - d.vec2f(epsR, 0))) *
      0.6;
    const ry =
      (fbm(input.uv * 18 + d.vec2f(0, epsR)) -
        fbm(input.uv * 18 - d.vec2f(0, epsR))) *
      0.6;
    nDelta = d.vec2f(rx, ry) * 0.4;

    const black = d.vec3f(0.07, 0.07, 0.08);
    const red = d.vec3f(0.45, 0.08, 0.08);
    const blue = d.vec3f(0.08, 0.16, 0.45);
    const yellow = d.vec3f(0.75, 0.55, 0.08);
    base = pick4(seed, black, red, blue, yellow) * (0.82 + n * 0.18);
    specExp = 6;
    specK = 0.12;
    ambient = 0.25;
    iridAmount = 0;
  } else if (mode === 3) {
    const gold = d.vec3f(1, 0.78, 0.3);
    const silver = d.vec3f(0.82, 0.84, 0.88);
    const copper = d.vec3f(0.9, 0.5, 0.25);
    const metal = pick3(seed, gold, silver, copper);
    const n = fbm(input.uv * 20);
    base = metal * (0.75 + n * 0.3);
    specExp = 64;
    specK = 1.2;
    ambient = 0.42;
    iridAmount = u.iridescence * 0.3;
    rimBoost = 1.4;
  } else if (mode === 4) {
    const hue = rim * 4 + seed * 2 + input.uv.x * 2.5 + input.uv.y * 2.5;
    const holo = d.vec3f(
      0.5 + 0.5 * std.sin(hue * 6.283 + 0),
      0.5 + 0.5 * std.sin(hue * 6.283 + 2.094),
      0.5 + 0.5 * std.sin(hue * 6.283 + 4.189)
    );
    base = d.vec3f(holo);
    specExp = 48;
    specK = 1;
    ambient = 0.55;
    iridAmount = 0;
    rimBoost = 1.6;
  } else if (mode === 5) {
    const swirl = fbm(input.uv * 4 + d.vec2f(fbm(input.uv * 2), 0));
    const vein = std.pow(std.abs(std.sin((input.uv.x + swirl * 1.3) * 12)), 6);
    const white = d.vec3f(0.94, 0.92, 0.88);
    const cream = d.vec3f(0.9, 0.85, 0.76);
    const dark = d.vec3f(0.22, 0.2, 0.22);
    const baseStone = std.mix(white, cream, fbm(input.uv * 6));
    base = std.mix(baseStone, dark, vein * 0.65);
    specExp = 32;
    specK = 0.4;
    ambient = 0.45;
    iridAmount = 0;
  } else if (mode === 6) {
    const neon = pick4(
      seed,
      d.vec3f(1, 0.15, 0.6),
      d.vec3f(0.15, 1, 0.85),
      d.vec3f(0.8, 0.3, 1),
      d.vec3f(0.3, 1, 0.3)
    );
    const flicker = 0.85 + 0.15 * std.sin(u.time * 8 + seed * 40);
    base = neon * 0.45;
    emissive = neon * (0.9 + std.pow(rim, 2) * 1.6) * flicker;
    specExp = 24;
    specK = 0.6;
    ambient = 1;
    iridAmount = 0;
    rimBoost = 2;
  } else {
    const tint = pick3(
      seed,
      d.vec3f(0.65, 0.85, 0.95),
      d.vec3f(0.75, 0.95, 0.8),
      d.vec3f(0.85, 0.7, 0.95)
    );
    base = d.vec3f(tint * (0.5 + rim * 0.6));
    specExp = 80;
    specK = 1.4;
    ambient = 0.2;
    alphaMul = 0.55 + rim * 0.45;
    iridAmount = u.iridescence * 0.3;
    rimBoost = 1.5;
  }

  const Nperturbed = std.normalize(Nbase + (tang * nDelta.x + bitan * nDelta.y));
  const wrap = std.clamp(std.abs(std.dot(Nperturbed, L)) * 0.85 + 0.15, 0, 1.2);
  const spec = std.pow(std.abs(std.dot(Nperturbed, H)), specExp) * specK;

  const t = rim + seed * 0.37;
  const iridColor = d.vec3f(
    0.5 + 0.5 * std.sin(t * 6.28318 + 0),
    0.5 + 0.5 * std.sin(t * 6.28318 + 2.094),
    0.5 + 0.5 * std.sin(t * 6.28318 + 4.189)
  );
  const shaded = std.mix(base, iridColor, iridAmount);

  let lit = shaded * (ambient + 0.8 * wrap) + d.vec3f(spec) + emissive;
  lit = lit + base * std.pow(rim, 3) * rimBoost;

  const finalAlpha = input.color.a * maskAlpha * texAlpha * alphaMul;
  return d.vec4f(lit, finalAlpha);
});

export type ConfettiPipelines = {
  computePipeline: TgpuComputePipeline;
  renderPipeline: TgpuRenderPipeline;
};

export const createConfettiPipelines = (
  root: TgpuRoot,
  presentationFormat: GPUTextureFormat
): ConfettiPipelines => ({
  computePipeline: root.createComputePipeline({
    compute: confettiCompute,
  }),
  renderPipeline: root.createRenderPipeline({
    vertex: confettiVertex,
    fragment: confettiFragment,
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
