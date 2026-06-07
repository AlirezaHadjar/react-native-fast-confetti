// Per-particle layouts (std430, 16-byte aligned):
//   Spawn: pos0, vel0, quat0, omega0, drag, info  — 96B
export const SPAWN_BYTES = 96;

// Runtime: pos+life, vel, quat, omega  — 64B
export const RUNTIME_BYTES = 64;

// Size metadata: dims (w,h,radius,flags) + _pad — 32B
export const SIZE_META_BYTES = 32;

// Uniforms — must match the `Uniforms` struct in WGSL below (128B, std140).
export const UNIFORMS_BYTES = 128;

const UNIFORMS_WGSL = /* wgsl */ `
struct Uniforms {
  viewport:          vec2f,
  focalLength:       f32,
  opacity:           f32,

  dt:                f32,
  time:              f32,
  drift:             f32,
  initialScale:      f32,

  windStrength:      f32,
  magnusStrength:    f32,
  continuous:        f32,
  infinite:          f32,

  progress:          f32,
  cycleCount:        f32,
  cycleDuration:     f32,
  fadeOutOnEnd:      f32,

  fadeStart:         f32,
  bounceRestitution: f32,
  floorFriction:     f32,
  motionBlurAmount:  f32,

  shadowOpacity:     f32,
  iridescence:       f32,
  gravityMag:        f32,
  textureMode:       f32,

  lightDir:          vec3f,
  minVisibleScale:   f32,

  gravityDir:        vec3f,
  _pad2:             f32,
};
`;

const STRUCTS_WGSL = /* wgsl */ `
struct Spawn {
  pos0:   vec3f, _sp0: f32,
  vel0:   vec3f, _sp1: f32,
  quat0:  vec4f,
  omega0: vec3f, _sp2: f32,
  drag:   vec4f,
  info:   vec4f,
};

struct Runtime {
  pos:   vec3f, life: f32,
  vel:   vec3f, _rt0: f32,
  quat:  vec4f,
  omega: vec3f, _rt1: f32,
};

struct Size {
  dims: vec4f,
  _pad: vec4f,
};
`;

const QUAT_WGSL = /* wgsl */ `
fn qMul(a: vec4f, b: vec4f) -> vec4f {
  return vec4f(
    a.w * b.xyz + b.w * a.xyz + cross(a.xyz, b.xyz),
    a.w * b.w - dot(a.xyz, b.xyz)
  );
}
fn qRot(q: vec4f, v: vec3f) -> vec3f {
  let u = q.xyz;
  return 2.0 * dot(u, v) * u + (q.w * q.w - dot(u, u)) * v + 2.0 * q.w * cross(u, v);
}
fn qConj(q: vec4f) -> vec4f { return vec4f(-q.xyz, q.w); }
fn qIntegrate(q: vec4f, omegaWorld: vec3f, dt: f32) -> vec4f {
  let wq = vec4f(omegaWorld, 0.0);
  let dq = 0.5 * dt * qMul(wq, q);
  return normalize(q + dq);
}
`;

export const computeCode = /* wgsl */ `
${UNIFORMS_WGSL}
${STRUCTS_WGSL}
${QUAT_WGSL}

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<storage, read> spawns: array<Spawn>;
@group(0) @binding(2) var<storage, read_write> runtime: array<Runtime>;

fn hash13(p: vec3f) -> f32 {
  var q = fract(p * 0.1031);
  q += dot(q, q.zyx + 31.32);
  return fract((q.x + q.y) * q.z);
}
fn vnoise3(x: vec3f) -> f32 {
  let i = floor(x);
  let f = fract(x);
  let w = f * f * (3.0 - 2.0 * f);
  let a = mix(hash13(i + vec3f(0.,0.,0.)), hash13(i + vec3f(1.,0.,0.)), w.x);
  let b = mix(hash13(i + vec3f(0.,1.,0.)), hash13(i + vec3f(1.,1.,0.)), w.x);
  let c = mix(hash13(i + vec3f(0.,0.,1.)), hash13(i + vec3f(1.,0.,1.)), w.x);
  let d = mix(hash13(i + vec3f(0.,1.,1.)), hash13(i + vec3f(1.,1.,1.)), w.x);
  return mix(mix(a, b, w.y), mix(c, d, w.y), w.z);
}
fn windField(p: vec3f, t: f32) -> vec3f {
  let scale = vec3f(0.006, 0.006, 0.01);
  let tv = vec3f(t * 0.25);
  let eps = 1.0;
  let q = p * scale + tv;
  let dY = vnoise3(q + vec3f(0., eps, 0.)) - vnoise3(q - vec3f(0., eps, 0.));
  let dX = vnoise3(q + vec3f(eps, 0., 0.)) - vnoise3(q - vec3f(eps, 0., 0.));
  let dZ = vnoise3(q + vec3f(0., 0., eps)) - vnoise3(q - vec3f(0., 0., eps));
  return vec3f(dY, -dX * 0.5, dZ) * 180.0;
}

@compute @workgroup_size(64)
fn cs_update(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= arrayLength(&runtime)) { return; }
  let spawn = spawns[idx];
  var rt = runtime[idx];

  rt.life += u.dt;
  // Dormant staggering: pieces with negative life haven't started yet.
  if (rt.life < 0.0) { runtime[idx] = rt; return; }

  let Cn      = spawn.drag.x;
  let Ct      = spawn.drag.y;
  let Crot    = spawn.drag.z;
  let magnusK = spawn.drag.w;

  let qConjOrient = qConj(rt.quat);
  let vBody = qRot(qConjOrient, rt.vel);
  let fBody = vec3f(
    -Cn * vBody.x * abs(vBody.x),
    -Cn * vBody.y * abs(vBody.y),
    -Ct * vBody.z * abs(vBody.z),
  );
  let fDrag = qRot(rt.quat, fBody);

  let fMagnus  = magnusK * u.magnusStrength * cross(rt.omega, rt.vel);
  let fWind    = windField(rt.pos, u.time) * u.windStrength;
  let fGravity = u.gravityDir * u.gravityMag;
  let accel    = fGravity + fDrag + fMagnus + fWind;

  var newVel = rt.vel + accel * u.dt;
  let vMag = length(newVel);
  let vMax = u.gravityMag * 1.5;
  if (vMag > vMax) { newVel = newVel * (vMax / vMag); }
  rt.vel = newVel;
  rt.pos = rt.pos + rt.vel * u.dt;

  // (Ground collision/pile-up intentionally omitted — pieces fall off.)

  // Angular: tumble bias cancels damping at |omega|=|omega0|.
  let omega0Len = length(spawn.omega0);
  let tumbleAxis = select(
    vec3f(1.0, 0.0, 0.0),
    spawn.omega0 / max(omega0Len, 0.0001),
    omega0Len > 0.0001
  );
  let tumbleBias = tumbleAxis * omega0Len * omega0Len * Crot;
  let damping    = -Crot * rt.omega * length(rt.omega);
  var newOmega = rt.omega + (tumbleBias + damping) * u.dt;
  // Clamp |omega| so semi-implicit Euler stays stable even with large dt.
  let wMag = length(newOmega);
  let wMax = max(omega0Len * 1.5, 25.0);
  if (wMag > wMax) { newOmega = newOmega * (wMax / wMag); }
  rt.omega = newOmega;
  rt.quat  = qIntegrate(rt.quat, rt.omega, u.dt);

  runtime[idx] = rt;
}
`;

export const renderCode = /* wgsl */ `
${UNIFORMS_WGSL}
${STRUCTS_WGSL}
${QUAT_WGSL}

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<storage, read> spawns: array<Spawn>;
@group(0) @binding(2) var<storage, read> runtime: array<Runtime>;
@group(0) @binding(3) var<storage, read> sizes: array<Size>;
@group(0) @binding(4) var<storage, read> palette: array<vec4f>;
@group(0) @binding(5) var samp: sampler;
@group(0) @binding(6) var texArr: texture_2d_array<f32>;

struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
  @location(1) color: vec4f,
  @location(2) normal: vec3f,
  @location(3) sizeAndRadius: vec3f,
  @location(4) flagsAndLayer: vec2f,  // flags, textureLayer
  @location(5) seedAndRim: vec2f,     // per-instance seed (0..1), rim factor
};

fn project(p: vec3f) -> vec2f {
  let cx = u.viewport.x * 0.5;
  let cy = u.viewport.y * 0.5;
  let zRel = max(p.z + u.focalLength, 1.0);
  return vec2f(cx + (p.x - cx) * (u.focalLength / zRel),
               cy + (p.y - cy) * (u.focalLength / zRel));
}

fn toClip(screen: vec2f) -> vec2f {
  return vec2f((screen.x / u.viewport.x) * 2.0 - 1.0,
               1.0 - (screen.y / u.viewport.y) * 2.0);
}

fn normalizeOr2(v: vec2f, fallback: vec2f) -> vec2f {
  let len = length(v);
  return select(fallback, v / max(len, 0.0001), len > 0.0001);
}

fn clampAxis(axis: vec2f, fallback: vec2f, minLen: f32) -> vec2f {
  let dir = normalizeOr2(axis, fallback);
  return dir * max(length(axis), minLen);
}

// Tessellated flake: TESS × TESS quads = TESS*TESS*6 vertices per instance.
const TESS: u32 = 6u;
const VERTS_PER_FLAKE: u32 = TESS * TESS * 6u;

@vertex
fn vs_main(
  @builtin(vertex_index) vid: u32,
  @builtin(instance_index) iid: u32,
) -> VOut {
  // Cell within flake + vertex within cell.
  let cellIdx    = vid / 6u;
  let vertInCell = vid % 6u;
  let cellX = cellIdx % TESS;
  let cellY = cellIdx / TESS;

  // Local offsets per-cell vertex (two triangles forming a quad).
  var off = vec2f(0.0);
  if (vertInCell == 0u) { off = vec2f(0.0, 0.0); }
  else if (vertInCell == 1u) { off = vec2f(1.0, 0.0); }
  else if (vertInCell == 2u) { off = vec2f(1.0, 1.0); }
  else if (vertInCell == 3u) { off = vec2f(0.0, 0.0); }
  else if (vertInCell == 4u) { off = vec2f(1.0, 1.0); }
  else                       { off = vec2f(0.0, 1.0); }

  let u_  = (f32(cellX) + off.x) / f32(TESS);
  let v_  = (f32(cellY) + off.y) / f32(TESS);

  let spawn = spawns[iid];
  let rt    = runtime[iid];
  let sizeIdx  = u32(spawn.info.x);
  let colorIdx = u32(spawn.info.y);
  let size     = sizes[sizeIdx];
  let width  = size.dims.x;
  let height = size.dims.y;
  let radius = size.dims.z;
  let flags  = size.dims.w;
  let textureLayer = f32(u32(flags) >> 16u);

  // Match the Skia renderer's first 5% appear ramp.
  let appearWindow = max(u.cycleDuration * 0.05, 0.0001);
  let appearT    = select(clamp(rt.life / appearWindow, 0.0, 1.0), 1.0, u.continuous > 0.5);
  let appearScale = u.initialScale + (1.0 - u.initialScale) * appearT;

  // ---- Procedural bend: a travelling wave across the flake ----
  // Amplitude scales with piece speed (more aerodynamic flex when fast) + a
  // base per-piece amplitude derived from its phase offset.
  let speed = length(rt.vel);
  let minSide = min(width, height);
  let phase = rt.life * 4.5 + spawn.info.w * 6.28318;
  let bendAmp = minSide * (0.12 + 0.25 * clamp(speed / 600.0, 0.0, 1.0));
  let baseAmp = select(bendAmp, 0.0, u.textureMode < 0.5);
  // z(u, v) = A * sin(u·2π + phase) · sin(v·π). Zero at u-edges, peak at v=0.5.
  let sU = sin(u_ * 6.28318 + phase);
  let cU = cos(u_ * 6.28318 + phase);
  let sV = sin(v_ * 3.14159);
  let cV = cos(v_ * 3.14159);
  let zBend = baseAmp * sU * sV;

  // Analytic body-frame normal.
  let dzdu = baseAmp * 6.28318 * cU * sV;  // ∂z/∂u
  let dzdv = baseAmp * 3.14159 * sU * cV;  // ∂z/∂v
  // Convert to ∂z/∂x and ∂z/∂y (where x spans width, y spans height):
  let dzdx = dzdu / max(width, 0.0001);
  let dzdy = dzdv / max(height, 0.0001);
  let nBody = normalize(vec3f(-dzdx, -dzdy, 1.0));

  // Drift: damp lateral motion toward spawn column.
  let lateralDamp = mix(0.0, 1.0, u.drift);
  var centerWorld = rt.pos;
  centerWorld.x = spawn.pos0.x + (centerWorld.x - spawn.pos0.x) * lateralDamp;

  let centerScreen = project(centerWorld);
  let perspectiveScale = u.focalLength / max(centerWorld.z + u.focalLength, 1.0);

  let axisXWorld = qRot(rt.quat, vec3f(width * 0.5 * appearScale, 0.0, 0.0));
  let axisYWorld = qRot(rt.quat, vec3f(0.0, height * 0.5 * appearScale, 0.0));
  let axisZWorld = qRot(rt.quat, vec3f(0.0, 0.0, zBend * appearScale));

  var axisXScreen = project(centerWorld + axisXWorld) - centerScreen;
  var axisYScreen = project(centerWorld + axisYWorld) - centerScreen;
  let bendScreen = project(centerWorld + axisZWorld) - centerScreen;

  let yDir0 = normalizeOr2(axisYScreen, vec2f(0.0, 1.0));
  let xFallback = vec2f(-yDir0.y, yDir0.x);
  let minVisibleScale = clamp(u.minVisibleScale, 0.0, 1.0);
  axisXScreen = clampAxis(
    axisXScreen,
    xFallback,
    width * 0.5 * appearScale * perspectiveScale * minVisibleScale
  );
  let xDir = normalizeOr2(axisXScreen, vec2f(1.0, 0.0));
  axisYScreen = clampAxis(
    axisYScreen,
    vec2f(-xDir.y, xDir.x),
    height * 0.5 * appearScale * perspectiveScale * minVisibleScale
  );

  var screen =
    centerScreen +
    axisXScreen * ((u_ - 0.5) * 2.0) +
    axisYScreen * ((v_ - 0.5) * 2.0) +
    bendScreen;

  // Motion blur stretch along velocity direction.
  if (u.motionBlurAmount > 0.001 && speed > 1.0) {
    let velDir = rt.vel / speed;
    let stretch = (u.motionBlurAmount * min(speed, 1200.0)) / 1200.0 * 0.6;
    let blurWorld = centerWorld + velDir * ((v_ - 0.5) * height * stretch);
    screen = screen + (project(blurWorld) - centerScreen);
  }

  let clip   = toClip(screen);

  // World-space normal = body bent normal rotated by piece quaternion.
  let N = qRot(rt.quat, nBody);
  let V = vec3f(0.0, 0.0, -1.0);
  let rim = 1.0 - abs(dot(normalize(N), V));

  // Opacity driven by CPU (includes fade-out-on-end mixing).
  let alpha = u.opacity;

  var out: VOut;
  out.pos = vec4f(clip, 0.0, 1.0);
  out.uv  = vec2f(u_, 1.0 - v_);
  out.color = vec4f(palette[colorIdx].rgb, alpha);
  out.normal = N;
  out.sizeAndRadius = vec3f(width, height, radius);
  out.flagsAndLayer = vec2f(flags, textureLayer);
  // Stable per-instance seed (hash of index) in [0,1] so fragment can pick a
  // piece-specific wood grain / rubber color / etc.
  let iSeed = fract(sin(f32(iid) * 12.9898) * 43758.5453);
  out.seedAndRim = vec2f(iSeed, rim);
  return out;
}

fn sdfRoundedBoxPx(p: vec2f, halfExtent: vec2f, radius: f32) -> f32 {
  let r = min(radius, min(halfExtent.x, halfExtent.y));
  let q = abs(p) - (halfExtent - vec2f(r));
  let qPos = max(q, vec2f(0.0));
  let len = length(qPos);
  let inside = min(max(q.x, q.y), 0.0);
  return len + inside - r;
}

// --- Procedural noise helpers (value noise) ---
fn hash12(p: vec2f) -> f32 {
  var q = fract(p * vec2f(123.34, 345.45));
  q = q + dot(q, q + 34.345);
  return fract(q.x * q.y);
}
fn vnoise2(x: vec2f) -> f32 {
  let i = floor(x);
  let f = fract(x);
  let w = f * f * (3.0 - 2.0 * f);
  let a = mix(hash12(i + vec2f(0.0, 0.0)), hash12(i + vec2f(1.0, 0.0)), w.x);
  let b = mix(hash12(i + vec2f(0.0, 1.0)), hash12(i + vec2f(1.0, 1.0)), w.x);
  return mix(a, b, w.y);
}
// Fractal brownian motion, 3 octaves.
fn fbm(x: vec2f) -> f32 {
  var amp = 0.5;
  var freq = 1.0;
  var sum = 0.0;
  for (var i = 0; i < 3; i = i + 1) {
    sum = sum + amp * vnoise2(x * freq);
    amp = amp * 0.5;
    freq = freq * 2.1;
  }
  return sum;
}

fn pick3(seed: f32, a: vec3f, b: vec3f, c: vec3f) -> vec3f {
  let t = fract(seed * 7.919);
  if (t < 0.333) { return a; }
  if (t < 0.666) { return b; }
  return c;
}
fn pick4(seed: f32, a: vec3f, b: vec3f, c: vec3f, d: vec3f) -> vec3f {
  let t = fract(seed * 13.37);
  if (t < 0.25) { return a; }
  if (t < 0.50) { return b; }
  if (t < 0.75) { return c; }
  return d;
}

@fragment
fn fs_main(in: VOut) -> @location(0) vec4f {
  let flags = u32(in.flagsAndLayer.x);
  let isGlossy   = (flags & 1u) != 0u;
  let isTextured = (flags & 2u) != 0u;
  let rim        = in.seedAndRim.y;
  let seed       = in.seedAndRim.x;
  let mode       = u32(u.textureMode);

  // Rounded-rect mask.
  let flakeSize = in.sizeAndRadius.xy;
  let radius = in.sizeAndRadius.z;
  let p = (in.uv - vec2f(0.5)) * flakeSize;
  let d = sdfRoundedBoxPx(p, flakeSize * 0.5, radius);
  let radiusActive = step(0.01, radius);
  let aa = max(fwidth(d), 0.5);
  let insideMask = 1.0 - smoothstep(-aa, aa, d);
  let maskAlpha  = mix(1.0, insideMask, radiusActive);

  let layer = i32(in.flagsAndLayer.y);
  let texColor = textureSample(texArr, samp, in.uv, layer);
  let paletteRgb = in.color.rgb;
  // External image/SVG textures always win.
  let texAlpha = select(1.0, texColor.a, isTextured);

  if (mode == 0u) {
    var skiaColor = paletteRgb;
    if (isTextured) {
      skiaColor = texColor.rgb;
    } else if (isGlossy) {
      let lighter = paletteRgb + (vec3f(1.0) - paletteRgb) * 0.35;
      skiaColor = mix(lighter, paletteRgb, clamp(in.uv.y / 0.6, 0.0, 1.0));
    }

    let finalAlpha = in.color.a * maskAlpha * texAlpha;
    return vec4f(skiaColor, finalAlpha);
  }

  // Tangent basis for normal perturbation.
  let Nbase = normalize(in.normal);
  let tUp   = select(vec3f(0.0, 1.0, 0.0), vec3f(1.0, 0.0, 0.0), abs(Nbase.y) > 0.9);
  let tang  = normalize(cross(tUp, Nbase));
  let bitan = cross(Nbase, tang);

  let L = normalize(u.lightDir);
  let V = vec3f(0.0, 0.0, -1.0);
  let H = normalize(L + V);

  var base: vec3f = paletteRgb;
  var nDelta = vec2f(0.0);    // tangent-space normal perturbation
  var specExp: f32 = 12.0;
  var specK:   f32 = 0.3;
  var ambient: f32 = 0.32;
  var iridAmount: f32 = u.iridescence * 0.5;
  var emissive: vec3f = vec3f(0.0);
  var alphaMul: f32 = 1.0;
  var rimBoost: f32 = 0.0;

  if (isTextured) {
    // External image/SVG texture — use sampled color directly.
    base = texColor.rgb;
    specExp = 24.0; specK = 0.35;
  } else if (mode == 1u) {
    // ===== Wood =====
    let grainDir = vec2f(in.uv.x * 0.22, in.uv.y * 1.4);
    let turb = fbm(grainDir * 3.0) * 0.5 + fbm(grainDir * 12.0) * 0.15;
    let rings = 0.5 + 0.5 * sin(grainDir.x * 28.0 + turb * 6.0);
    let grainMask = pow(rings, 1.8);
    let knot = smoothstep(0.72, 0.88, fbm(in.uv * 5.0));
    let eps = 1.0 / 96.0;
    let gx = (fbm(grainDir*12.0 + vec2f(eps,0.0)) - fbm(grainDir*12.0 - vec2f(eps,0.0))) * 0.8;
    let gy = (fbm(grainDir*12.0 + vec2f(0.0,eps)) - fbm(grainDir*12.0 - vec2f(0.0,eps))) * 0.3;
    nDelta = vec2f(gx, gy) * 0.35;

    let walnut   = vec3f(0.26, 0.16, 0.09);
    let oak      = vec3f(0.55, 0.38, 0.22);
    let cherry   = vec3f(0.48, 0.22, 0.15);
    let tinted   = pick3(seed, walnut, oak, cherry);
    let shaded   = tinted * (0.55 + grainMask * 0.55);
    base = mix(shaded, tinted * 0.18, knot);
    specExp = 10.0; specK = 0.15; ambient = 0.3;
    iridAmount = 0.0;
  } else if (mode == 2u) {
    // ===== Rubber =====
    let n = fbm(in.uv * 18.0);
    let epsR = 1.0 / 64.0;
    let rx = (fbm(in.uv*18.0 + vec2f(epsR,0.0)) - fbm(in.uv*18.0 - vec2f(epsR,0.0))) * 0.6;
    let ry = (fbm(in.uv*18.0 + vec2f(0.0,epsR)) - fbm(in.uv*18.0 - vec2f(0.0,epsR))) * 0.6;
    nDelta = vec2f(rx, ry) * 0.4;

    let black  = vec3f(0.07, 0.07, 0.08);
    let red    = vec3f(0.45, 0.08, 0.08);
    let blue   = vec3f(0.08, 0.16, 0.45);
    let yellow = vec3f(0.75, 0.55, 0.08);
    base = pick4(seed, black, red, blue, yellow) * (0.82 + n * 0.18);
    specExp = 6.0; specK = 0.12; ambient = 0.25;
    iridAmount = 0.0;
  } else if (mode == 3u) {
    // ===== Gold Foil / Metallic =====
    let gold   = vec3f(1.0, 0.78, 0.30);
    let silver = vec3f(0.82, 0.84, 0.88);
    let copper = vec3f(0.90, 0.50, 0.25);
    let metal  = pick3(seed, gold, silver, copper);
    let n = fbm(in.uv * 20.0);
    base = metal * (0.75 + n * 0.3);
    specExp = 64.0; specK = 1.2; ambient = 0.42;
    iridAmount = u.iridescence * 0.3;
    rimBoost = 1.4;
  } else if (mode == 4u) {
    // ===== Holographic =====
    let hue = rim * 4.0 + seed * 2.0 + in.uv.x * 2.5 + in.uv.y * 2.5;
    let holo = vec3f(
      0.5 + 0.5 * sin(hue * 6.283 + 0.0),
      0.5 + 0.5 * sin(hue * 6.283 + 2.094),
      0.5 + 0.5 * sin(hue * 6.283 + 4.189),
    );
    base = holo;
    specExp = 48.0; specK = 1.0; ambient = 0.55;
    iridAmount = 0.0;
    rimBoost = 1.6;
  } else if (mode == 5u) {
    // ===== Marble =====
    let swirl = fbm(in.uv * 4.0 + vec2f(fbm(in.uv * 2.0), 0.0));
    let vein = pow(abs(sin((in.uv.x + swirl * 1.3) * 12.0)), 6.0);
    let white = vec3f(0.94, 0.92, 0.88);
    let cream = vec3f(0.90, 0.85, 0.76);
    let dark  = vec3f(0.22, 0.20, 0.22);
    let baseStone = mix(white, cream, fbm(in.uv * 6.0));
    base = mix(baseStone, dark, vein * 0.65);
    specExp = 32.0; specK = 0.4; ambient = 0.45;
    iridAmount = 0.0;
  } else if (mode == 6u) {
    // ===== Neon / Emissive =====
    let neon = pick4(
      seed,
      vec3f(1.0, 0.15, 0.60),
      vec3f(0.15, 1.0, 0.85),
      vec3f(0.80, 0.30, 1.0),
      vec3f(0.30, 1.0, 0.30),
    );
    let flicker = 0.85 + 0.15 * sin(u.time * 8.0 + seed * 40.0);
    base = neon * 0.45;
    emissive = neon * (0.9 + pow(rim, 2.0) * 1.6) * flicker;
    specExp = 24.0; specK = 0.6; ambient = 1.0;
    iridAmount = 0.0;
    rimBoost = 2.0;
  } else {
    // ===== Glass =====
    let tint = pick3(
      seed,
      vec3f(0.65, 0.85, 0.95),
      vec3f(0.75, 0.95, 0.80),
      vec3f(0.85, 0.70, 0.95),
    );
    base = tint * (0.5 + rim * 0.6);
    specExp = 80.0; specK = 1.4; ambient = 0.2;
    alphaMul = 0.55 + rim * 0.45;  // translucent, edges opaque
    iridAmount = u.iridescence * 0.3;
    rimBoost = 1.5;
  }

  // Apply per-mode micro-normal.
  let Nperturbed = normalize(Nbase + (tang * nDelta.x + bitan * nDelta.y));
  let wrap = clamp(abs(dot(Nperturbed, L)) * 0.85 + 0.15, 0.0, 1.2);
  let spec = pow(abs(dot(Nperturbed, H)), specExp) * specK;

  // Shared iridescence mix (most modes set iridAmount=0 so this is a no-op).
  let t = rim + seed * 0.37;
  let iridColor = vec3f(
    0.5 + 0.5 * sin(t * 6.28318 + 0.0),
    0.5 + 0.5 * sin(t * 6.28318 + 2.094),
    0.5 + 0.5 * sin(t * 6.28318 + 4.189),
  );
  let shaded = mix(base, iridColor, iridAmount);

  var lit = shaded * (ambient + 0.8 * wrap) + vec3f(spec) + emissive;
  lit = lit + base * pow(rim, 3.0) * rimBoost;

  let finalAlpha = in.color.a * maskAlpha * texAlpha * alphaMul;
  return vec4f(lit, finalAlpha);
}
`;
