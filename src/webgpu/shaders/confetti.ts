import {
  d,
  std,
  tgpu,
  type TgpuComputePipeline,
  type TgpuRenderPipeline,
  type TgpuRoot,
} from 'typegpu';
import {
  FLOOR_ANGULAR_DAMPING_PER_SECOND,
  FLOOR_BOUNCE_DECAY,
  FLOOR_DEPTH_DAMPING_PER_SECOND,
  FLOOR_MAX_FAR_DEPTH_OFFSET,
  FLOOR_MAX_NEAR_DEPTH_OFFSET,
  FLOOR_SLEEP_BOUNCE_SCALE,
  FLOOR_SLEEP_STABLE_SECONDS,
  FLOOR_TANGENTIAL_RETENTION,
} from '../constants';
import {
  getParticleNearPlaneDistance,
  isParticleInFrontOfNearPlane,
} from '../perspective';
import {
  SIZE_FLAG_GLOSSY,
  SIZE_FLAG_LAYER_MASK,
  SIZE_FLAG_MASK_LAYER_SHIFT,
  SIZE_FLAG_SHAPE_MASK,
  SIZE_FLAG_TEXTURED,
  SIZE_FLAG_TEXTURE_LAYER_SHIFT,
} from '../resourcePacking';
import { createAlphaBlendTarget } from './blendTarget';
import {
  integrateQuaternion,
  random01,
  randomRange,
  rotateByQuaternion,
} from './gpuMath';
import { InitSizeSchema } from './sharedSchemas';
import {
  computeAirborneAcceleration,
  computeRelativeAirVelocity,
  integrateAngularVelocity,
} from './physics/aerodynamics';
import {
  applyFloorContactFriction,
  updateFloorSleepTime,
} from './physics/contact';
import { ParticleRuntimeSchema, ParticleSpawnSchema } from './physics/state';
import {
  clampProjectedAxis,
  normalizeOrFallback2,
  projectParticlePoint,
} from './physics/projection';

// A flake is a single instanced quad. A triangle strip covers it with four
// vertex invocations; the previous triangle-list path repeated two corners and
// paid for six executions of the relatively expensive vertex shader.
export const VERTS_PER_FLAKE = 4;

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

  interpolationAlpha: d.f32,
  stepsThisFrame: d.f32,
  motionDuration: d.f32,
  floorVariation: d.f32,

  reserved: d.f32,
  floorRestitution: d.f32,
  floorFriction: d.f32,
  motionBlurAmount: d.f32,

  shadowOpacity: d.f32,
  iridescence: d.f32,
  gravityMag: d.f32,
  textureMode: d.f32,

  lightDir: d.vec3f,
  minVisibleScale: d.f32,

  gravityDir: d.vec3f,
  settleOnFloor: d.f32,
});

export const InitUniformsSchema = d.struct({
  viewportAndLayout: d.vec4f,
  grid: d.vec4f,
  spawn: d.vec4f,
  rotation: d.vec4f,
  depthAndWobble: d.vec4f,
  physics: d.vec4f,
  dynamics: d.vec4f,
  zAndSizes: d.vec4f,
  seedAndFlags: d.vec4u,
  phasePermutation: d.vec4u,
});

export const SizeSchema = d.struct({
  dims: d.vec4f,
});

export const PaletteColorSchema = d.vec4f;

export const SIZE_META_BYTES = d.sizeOf(SizeSchema);
export const UNIFORMS_BYTES = d.sizeOf(UniformsSchema);
export const INIT_UNIFORMS_BYTES = d.sizeOf(InitUniformsSchema);

const toFloatOffset = (byteOffset: number) =>
  byteOffset / Float32Array.BYTES_PER_ELEMENT;

/** Float32 indices derived from the TypeGPU schema used by the hot-path upload. */
export const UNIFORM_FLOAT_OFFSETS = {
  viewportX: toFloatOffset(
    d.memoryLayoutOf(UniformsSchema, (uniforms) => uniforms.viewport.x).offset
  ),
  viewportY: toFloatOffset(
    d.memoryLayoutOf(UniformsSchema, (uniforms) => uniforms.viewport.y).offset
  ),
  focalLength: toFloatOffset(
    d.memoryLayoutOf(UniformsSchema, (uniforms) => uniforms.focalLength).offset
  ),
  opacity: toFloatOffset(
    d.memoryLayoutOf(UniformsSchema, (uniforms) => uniforms.opacity).offset
  ),
  dt: toFloatOffset(
    d.memoryLayoutOf(UniformsSchema, (uniforms) => uniforms.dt).offset
  ),
  time: toFloatOffset(
    d.memoryLayoutOf(UniformsSchema, (uniforms) => uniforms.time).offset
  ),
  drift: toFloatOffset(
    d.memoryLayoutOf(UniformsSchema, (uniforms) => uniforms.drift).offset
  ),
  initialScale: toFloatOffset(
    d.memoryLayoutOf(UniformsSchema, (uniforms) => uniforms.initialScale).offset
  ),
  windStrength: toFloatOffset(
    d.memoryLayoutOf(UniformsSchema, (uniforms) => uniforms.windStrength).offset
  ),
  magnusStrength: toFloatOffset(
    d.memoryLayoutOf(UniformsSchema, (uniforms) => uniforms.magnusStrength)
      .offset
  ),
  continuous: toFloatOffset(
    d.memoryLayoutOf(UniformsSchema, (uniforms) => uniforms.continuous).offset
  ),
  infinite: toFloatOffset(
    d.memoryLayoutOf(UniformsSchema, (uniforms) => uniforms.infinite).offset
  ),
  interpolationAlpha: toFloatOffset(
    d.memoryLayoutOf(UniformsSchema, (uniforms) => uniforms.interpolationAlpha)
      .offset
  ),
  stepsThisFrame: toFloatOffset(
    d.memoryLayoutOf(UniformsSchema, (uniforms) => uniforms.stepsThisFrame)
      .offset
  ),
  motionDuration: toFloatOffset(
    d.memoryLayoutOf(UniformsSchema, (uniforms) => uniforms.motionDuration)
      .offset
  ),
  floorVariation: toFloatOffset(
    d.memoryLayoutOf(UniformsSchema, (uniforms) => uniforms.floorVariation)
      .offset
  ),
  reserved: toFloatOffset(
    d.memoryLayoutOf(UniformsSchema, (uniforms) => uniforms.reserved).offset
  ),
  floorRestitution: toFloatOffset(
    d.memoryLayoutOf(UniformsSchema, (uniforms) => uniforms.floorRestitution)
      .offset
  ),
  floorFriction: toFloatOffset(
    d.memoryLayoutOf(UniformsSchema, (uniforms) => uniforms.floorFriction)
      .offset
  ),
  motionBlurAmount: toFloatOffset(
    d.memoryLayoutOf(UniformsSchema, (uniforms) => uniforms.motionBlurAmount)
      .offset
  ),
  shadowOpacity: toFloatOffset(
    d.memoryLayoutOf(UniformsSchema, (uniforms) => uniforms.shadowOpacity)
      .offset
  ),
  iridescence: toFloatOffset(
    d.memoryLayoutOf(UniformsSchema, (uniforms) => uniforms.iridescence).offset
  ),
  gravityMagnitude: toFloatOffset(
    d.memoryLayoutOf(UniformsSchema, (uniforms) => uniforms.gravityMag).offset
  ),
  textureMode: toFloatOffset(
    d.memoryLayoutOf(UniformsSchema, (uniforms) => uniforms.textureMode).offset
  ),
  lightDirectionX: toFloatOffset(
    d.memoryLayoutOf(UniformsSchema, (uniforms) => uniforms.lightDir.x).offset
  ),
  lightDirectionY: toFloatOffset(
    d.memoryLayoutOf(UniformsSchema, (uniforms) => uniforms.lightDir.y).offset
  ),
  lightDirectionZ: toFloatOffset(
    d.memoryLayoutOf(UniformsSchema, (uniforms) => uniforms.lightDir.z).offset
  ),
  minVisibleScale: toFloatOffset(
    d.memoryLayoutOf(UniformsSchema, (uniforms) => uniforms.minVisibleScale)
      .offset
  ),
  gravityDirectionX: toFloatOffset(
    d.memoryLayoutOf(UniformsSchema, (uniforms) => uniforms.gravityDir.x).offset
  ),
  gravityDirectionY: toFloatOffset(
    d.memoryLayoutOf(UniformsSchema, (uniforms) => uniforms.gravityDir.y).offset
  ),
  gravityDirectionZ: toFloatOffset(
    d.memoryLayoutOf(UniformsSchema, (uniforms) => uniforms.gravityDir.z).offset
  ),
  settleOnFloor: toFloatOffset(
    d.memoryLayoutOf(UniformsSchema, (uniforms) => uniforms.settleOnFloor)
      .offset
  ),
} as const;

export const SizeArraySchema = (count: number) => d.arrayOf(SizeSchema, count);
export const PaletteArraySchema = (count: number) =>
  d.arrayOf(PaletteColorSchema, count);
export const InitSizeArraySchema = (count: number) =>
  d.arrayOf(InitSizeSchema, count);

export const initLayout = tgpu
  .bindGroupLayout({
    uniforms: {
      uniform: InitUniformsSchema,
      visibility: ['compute'],
    },
    spawns: {
      storage: d.arrayOf(ParticleSpawnSchema),
      access: 'mutable',
      visibility: ['compute'],
    },
    runtime: {
      storage: d.arrayOf(ParticleRuntimeSchema),
      access: 'mutable',
      visibility: ['compute'],
    },
    sizes: {
      storage: d.arrayOf(InitSizeSchema),
      access: 'readonly',
      visibility: ['compute'],
    },
  })
  .$idx(0);

export const computeLayout = tgpu
  .bindGroupLayout({
    uniforms: {
      uniform: UniformsSchema,
      visibility: ['compute'],
    },
    spawns: {
      storage: d.arrayOf(ParticleSpawnSchema),
      access: 'readonly',
      visibility: ['compute'],
    },
    runtime: {
      storage: d.arrayOf(ParticleRuntimeSchema),
      access: 'mutable',
      visibility: ['compute'],
    },
    sizes: {
      storage: d.arrayOf(SizeSchema),
      access: 'readonly',
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
      storage: d.arrayOf(ParticleSpawnSchema),
      access: 'readonly',
      visibility: ['vertex'],
    },
    runtime: {
      storage: d.arrayOf(ParticleRuntimeSchema),
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
    shapeMasks: {
      texture: d.texture2dArray(d.f32),
      sampleType: 'float',
      visibility: ['fragment'],
    },
  })
  .$idx(0);

export const confettiInit = tgpu.computeFn({
  in: {
    gid: d.builtin.globalInvocationId,
  },
  workgroupSize: [64],
})(({ gid }) => {
  'use gpu';

  const idx = gid.x;
  const count = std.arrayLength(initLayout.$.spawns);
  if (idx >= count) {
    return;
  }

  const u = initLayout.$.uniforms;
  const seed = u.seedAndFlags.x;
  const continuous = u.seedAndFlags.y !== d.u32(0);
  const infinite = u.seedAndFlags.z !== d.u32(0);
  const layoutCount = d.u32(std.max(u.viewportAndLayout.w, 1));
  const layoutIndex = d.u32(
    std.div((idx + d.u32(1)) * layoutCount + count - d.u32(1), count) - 1
  );

  const columns = d.u32(std.max(u.grid.x, 1));
  const rows = d.u32(std.max(u.grid.y, 1));
  const rowIndex = d.u32(std.div(layoutIndex, columns));
  const columnIndex = layoutIndex - rowIndex * columns;
  let x = d.f32(columnIndex) * u.grid.z;
  if (rowIndex === rows - d.u32(1)) {
    const previousRows = (rows - d.u32(1)) * columns;
    const itemsInLastRow = std.max(layoutCount - previousRows, d.u32(1));
    const lastRowSpacing =
      (u.viewportAndLayout.x - d.f32(itemsInLastRow) * u.spawn.z) /
      (d.f32(itemsInLastRow) + 1);
    const positionInLastRow = layoutIndex - previousRows;
    x =
      lastRowSpacing + d.f32(positionInLastRow) * (u.spawn.z + lastRowSpacing);
  }

  const yJitter = randomRange(
    layoutIndex,
    d.u32(0),
    seed,
    -u.spawn.y * 0.5,
    u.spawn.y * 0.5
  );
  const y = d.f32(rowIndex) * u.grid.w + u.spawn.x + yJitter;
  const depthScale = randomRange(
    layoutIndex,
    d.u32(1),
    seed,
    u.depthAndWobble.x,
    u.depthAndWobble.y
  );
  const perspectiveZ = u.spawn.w / std.max(depthScale, 0.0001) - u.spawn.w;
  const z =
    perspectiveZ +
    randomRange(layoutIndex, d.u32(2), seed, u.zAndSizes.x, u.zAndSizes.y);

  const initialVy = std.select(
    randomRange(layoutIndex, d.u32(3), seed, 0, 0.4) * u.physics.y,
    u.dynamics.x * randomRange(layoutIndex, d.u32(3), seed, 0.95, 1.05),
    infinite
  );
  const initialVx =
    randomRange(layoutIndex, d.u32(4), seed, -0.15, 0.15) * u.physics.y;
  const initialVz =
    randomRange(layoutIndex, d.u32(5), seed, -0.05, 0.05) * u.physics.y;

  const safeTime = std.max(u.physics.x, 0.0001);
  const tumbleMag =
    randomRange(layoutIndex, d.u32(6), seed, u.rotation.x, u.rotation.y) /
    safeTime;
  const twistMag =
    randomRange(layoutIndex, d.u32(7), seed, u.rotation.z, u.rotation.w) /
    safeTime;
  const axisTheta = random01(layoutIndex, d.u32(8), seed) * 6.28318530718;
  const tumbleX = std.cos(axisTheta) * tumbleMag;
  const tumbleY = std.sin(axisTheta) * tumbleMag;
  const twistSign = std.select(
    d.f32(-1),
    d.f32(1),
    random01(layoutIndex, d.u32(9), seed) >= 0.5
  );
  const twistZ = twistSign * twistMag;

  const u1 = random01(layoutIndex, d.u32(10), seed);
  const u2 = random01(layoutIndex, d.u32(11), seed);
  const u3 = random01(layoutIndex, d.u32(12), seed);
  const s1 = std.sqrt(std.max(1 - u1, 0));
  const s2 = std.sqrt(std.max(u1, 0));
  const quat = d.vec4f(
    s1 * std.sin(6.28318530718 * u2),
    s1 * std.cos(6.28318530718 * u2),
    s2 * std.sin(6.28318530718 * u3),
    s2 * std.cos(6.28318530718 * u3)
  );

  const wobble = randomRange(
    layoutIndex,
    d.u32(13),
    seed,
    u.depthAndWobble.z,
    u.depthAndWobble.w
  );
  const cnScaled = u.physics.z * (1 + wobble * 4);
  const ctScaled = u.physics.w * (1 + wobble * 4);

  const sizeCount = d.u32(std.max(u.zAndSizes.z, 1));
  const sizeIndex = std.min(
    d.u32(
      std.round(
        random01(layoutIndex, d.u32(14), seed) * d.f32(sizeCount - d.u32(1))
      )
    ),
    sizeCount - d.u32(1)
  );
  const selection = initLayout.$.sizes[sizeIndex]!.selection;
  const colorStart = d.u32(std.max(selection.x, 0));
  const colorCount = d.u32(std.max(selection.y, 1));
  const colorIndex =
    colorStart +
    std.min(
      d.u32(
        std.round(
          random01(layoutIndex, d.u32(15), seed) * d.f32(colorCount - d.u32(1))
        )
      ),
      colorCount - d.u32(1)
    );
  const phaseBin =
    (layoutIndex * u.phasePermutation.x + u.phasePermutation.y) % layoutCount;
  const phaseOffset = std.select(
    d.f32(0),
    (d.f32(phaseBin) + random01(layoutIndex, d.u32(16), seed)) /
      d.f32(layoutCount),
    continuous
  );

  const spawn = ParticleSpawnSchema({
    pos0: d.vec3f(x, y, z),
    vel0: d.vec3f(initialVx, initialVy, initialVz),
    quat0: quat,
    omega0: d.vec3f(tumbleX, tumbleY, twistZ),
    drag: d.vec4f(cnScaled, ctScaled, u.dynamics.y, u.dynamics.z),
    info: d.vec4f(d.f32(sizeIndex), d.f32(colorIndex), u1, phaseOffset),
  });
  initLayout.$.spawns[idx] = ParticleSpawnSchema(spawn);
});

export const confettiRuntimeInit = tgpu.computeFn({
  in: {
    gid: d.builtin.globalInvocationId,
  },
  workgroupSize: [64],
})(({ gid }) => {
  'use gpu';

  const idx = gid.x;
  if (idx >= std.arrayLength(initLayout.$.runtime)) return;

  const spawn = initLayout.$.spawns[idx]!;
  const initialLife = -spawn.info.w * initLayout.$.uniforms.physics.x;
  initLayout.$.runtime[idx]!.pos = d.vec3f(spawn.pos0);
  initLayout.$.runtime[idx]!.life = initialLife;
  initLayout.$.runtime[idx]!.prevPos = d.vec3f(spawn.pos0);
  initLayout.$.runtime[idx]!.prevLife = initialLife;
  initLayout.$.runtime[idx]!.vel = d.vec3f(spawn.vel0);
  initLayout.$.runtime[idx]!.floorBounceScale = 1;
  initLayout.$.runtime[idx]!.quat = d.vec4f(spawn.quat0);
  initLayout.$.runtime[idx]!.prevQuat = d.vec4f(spawn.quat0);
  initLayout.$.runtime[idx]!.omega = d.vec3f(spawn.omega0);
  initLayout.$.runtime[idx]!.floorSleepTime = 0;
});

const toClip = tgpu.fn(
  [d.vec2f],
  d.vec2f
)((screen) => {
  'use gpu';

  const u = renderLayout.$.uniforms;
  return d.vec2f(
    (screen.x / u.viewport.x) * 2 - 1,
    1 - (screen.y / u.viewport.y) * 2
  );
});

const hash12 = tgpu.fn(
  [d.vec2f],
  d.f32
)((p) => {
  'use gpu';

  let q = std.fract(p * d.vec2f(123.34, 345.45));
  q = q + std.dot(q, q + 34.345);
  return std.fract(q.x * q.y);
});

const vnoise2 = tgpu.fn(
  [d.vec2f],
  d.f32
)((x) => {
  'use gpu';

  const i = std.floor(x);
  const f = std.fract(x);
  const w = f * f * (3 - 2 * f);
  const a = std.mix(hash12(i + d.vec2f(0, 0)), hash12(i + d.vec2f(1, 0)), w.x);
  const b = std.mix(hash12(i + d.vec2f(0, 1)), hash12(i + d.vec2f(1, 1)), w.x);
  return std.mix(a, b, w.y);
});

const fbm = tgpu.fn(
  [d.vec2f],
  d.f32
)((x) => {
  'use gpu';

  let amp = d.f32(0.5);
  let freq = d.f32(1);
  let sum = d.f32(0);
  for (const octave of std.range(3)) {
    sum = sum + amp * vnoise2(x * freq);
    amp = amp * 0.5;
    // oxlint-disable-next-line oxc/erasing-op -- Retain the range index in this TypeGPU expression.
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
  if (idx >= std.arrayLength(computeLayout.$.runtime)) return;
  const u = computeLayout.$.uniforms;
  const spawn = computeLayout.$.spawns[idx]!;
  const stored = computeLayout.$.runtime[idx]!;
  let position = d.vec3f(stored.pos);
  let life = stored.life + u.dt;
  let previousPosition = d.vec3f(stored.pos);
  let previousLife = stored.life;
  let velocity = d.vec3f(stored.vel);
  let floorBounceScale = stored.floorBounceScale;
  let quaternion = d.vec4f(stored.quat);
  let previousQuaternion = d.vec4f(stored.quat);
  let angularVelocity = d.vec3f(stored.omega);
  let floorSleepTime = stored.floorSleepTime;

  if (life >= 0) {
    if (u.continuous > 0.5 && position.y > u.viewport.y + 128) {
      position = d.vec3f(spawn.pos0);
      life = 0;
      previousPosition = d.vec3f(spawn.pos0);
      previousLife = 0;
      velocity = d.vec3f(spawn.vel0);
      floorBounceScale = 1;
      quaternion = d.vec4f(spawn.quat0);
      previousQuaternion = d.vec4f(spawn.quat0);
      angularVelocity = d.vec3f(spawn.omega0);
      floorSleepTime = 0;
    }
    if (u.settleOnFloor <= 0.5) floorSleepTime = 0;
    const sleeping =
      u.settleOnFloor > 0.5 && floorSleepTime >= FLOOR_SLEEP_STABLE_SECONDS;
    if (sleeping) return;
    const relativeAirVelocity = computeRelativeAirVelocity(
      position,
      velocity,
      u.windStrength,
      u.time
    );
    const acceleration = computeAirborneAcceleration(
      quaternion,
      relativeAirVelocity,
      angularVelocity,
      spawn.drag,
      u.gravityDir * u.gravityMag,
      u.magnusStrength
    );
    velocity += acceleration * u.dt;
    const maximumVelocity = u.gravityMag * 1.5;
    const velocityMagnitudeSquared = std.dot(velocity, velocity);
    if (velocityMagnitudeSquared > maximumVelocity * maximumVelocity) {
      velocity *= maximumVelocity * std.inverseSqrt(velocityMagnitudeSquared);
    }
    position += velocity * u.dt;

    if (u.settleOnFloor > 0.5) {
      const sizeIndex = d.u32(spawn.info.x);
      const dimensions = computeLayout.$.sizes[sizeIndex]!.dims;
      const floorPerspectiveDistance = std.max(
        position.z + u.focalLength,
        getParticleNearPlaneDistance(spawn.pos0.z + u.focalLength)
      );
      const perspectiveScale = u.focalLength / floorPerspectiveDistance;
      const floorInset = std.length(dimensions.xy) * 0.5 * perspectiveScale;
      const floorY = u.viewport.y - floorInset;
      if (position.y > floorY && velocity.y > 0) {
        const variation = std.clamp(u.floorVariation, 0, 1);
        const restitution =
          std.clamp(
            u.floorRestitution + (spawn.info.z * 2 - 1) * variation,
            0,
            1
          ) * floorBounceScale;
        position.y = floorY;
        velocity.y = -velocity.y * restitution;
        if (std.abs(velocity.y) <= u.gravityMag * u.dt * (1 + restitution)) {
          velocity.y = 0;
        }
        const frictionRandom = std.fract(spawn.info.z * 17.17 + 0.37);
        const floorFriction =
          std.clamp(
            u.floorFriction + (frictionRandom * 2 - 1) * variation,
            0,
            1
          ) *
          FLOOR_TANGENTIAL_RETENTION *
          std.sqrt(floorBounceScale);
        const contact = applyFloorContactFriction(
          velocity,
          angularVelocity,
          floorFriction
        );
        velocity = d.vec3f(contact.velocity);
        angularVelocity = d.vec3f(contact.angularVelocity);
        floorBounceScale *= FLOOR_BOUNCE_DECAY;
      }

      if (floorBounceScale < 1) {
        velocity.z *= std.max(0, 1 - FLOOR_DEPTH_DAMPING_PER_SECOND * u.dt);
        position.z = std.clamp(
          position.z,
          spawn.pos0.z - u.focalLength * FLOOR_MAX_NEAR_DEPTH_OFFSET,
          spawn.pos0.z + u.focalLength * FLOOR_MAX_FAR_DEPTH_OFFSET
        );
      }
    }

    let tumbleDrive = d.f32(1);
    if (u.settleOnFloor > 0.5 && floorBounceScale < 1) {
      tumbleDrive = floorBounceScale;
    }
    let nextAngularVelocity = integrateAngularVelocity(
      spawn.omega0,
      angularVelocity,
      quaternion,
      relativeAirVelocity,
      spawn.drag.z,
      tumbleDrive,
      u.dt
    );
    if (u.settleOnFloor > 0.5 && floorBounceScale < 1) {
      nextAngularVelocity *= std.max(
        0,
        1 - FLOOR_ANGULAR_DAMPING_PER_SECOND * u.dt
      );
      if (floorBounceScale <= FLOOR_SLEEP_BOUNCE_SCALE) {
        floorSleepTime = updateFloorSleepTime(
          floorSleepTime,
          velocity,
          nextAngularVelocity,
          u.dt
        );
        if (floorSleepTime >= FLOOR_SLEEP_STABLE_SECONDS) {
          velocity = d.vec3f(0);
          nextAngularVelocity = d.vec3f(0);
        }
      } else {
        floorSleepTime = 0;
      }
    }
    angularVelocity = d.vec3f(nextAngularVelocity);
    quaternion = d.vec4f(
      integrateQuaternion(quaternion, angularVelocity, u.dt)
    );
  }

  computeLayout.$.runtime[idx]!.pos = d.vec3f(position);
  computeLayout.$.runtime[idx]!.life = life;
  computeLayout.$.runtime[idx]!.prevPos = d.vec3f(previousPosition);
  computeLayout.$.runtime[idx]!.prevLife = previousLife;
  computeLayout.$.runtime[idx]!.vel = d.vec3f(velocity);
  computeLayout.$.runtime[idx]!.floorBounceScale = floorBounceScale;
  computeLayout.$.runtime[idx]!.quat = d.vec4f(quaternion);
  computeLayout.$.runtime[idx]!.prevQuat = d.vec4f(previousQuaternion);
  computeLayout.$.runtime[idx]!.omega = d.vec3f(angularVelocity);
  computeLayout.$.runtime[idx]!.floorSleepTime = floorSleepTime;
});

const VertexOut = {
  position: d.builtin.position,
  uv: d.location(0, d.vec2f),
  color: d.location(1, d.vec4f),
  normal: d.location(2, d.vec3f),
  flagsAndLayers: d.location(3, d.vec3f),
  seedAndRim: d.location(4, d.vec2f),
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
  let uv = d.vec2f(0);
  if (vertexIndex === 1) {
    uv = d.vec2f(1, 0);
  } else if (vertexIndex === 2) {
    uv = d.vec2f(0, 1);
  } else if (vertexIndex === 3) {
    uv = d.vec2f(1, 1);
  }

  const u0 = uv.x;
  const v0 = uv.y;

  const spawn = renderLayout.$.spawns[instanceIndex]!;
  const rt = renderLayout.$.runtime[instanceIndex]!;
  const interpolationAlpha = std.clamp(u.interpolationAlpha, 0, 1);
  const interpolatedPos = std.mix(rt.prevPos, rt.pos, interpolationAlpha);
  const interpolatedLife = std.mix(rt.prevLife, rt.life, interpolationAlpha);
  const quaternionSign = std.select(
    d.f32(-1),
    d.f32(1),
    std.dot(rt.prevQuat, rt.quat) >= 0
  );
  const interpolatedQuat = std.normalize(
    std.mix(rt.prevQuat, rt.quat * quaternionSign, interpolationAlpha)
  );
  const sizeIdx = d.u32(spawn.info.x);
  const colorIdx = d.u32(spawn.info.y);
  const size = renderLayout.$.sizes[sizeIdx]!;
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

  const appearWindow = std.max(u.motionDuration * 0.05, 0.0001);
  const appearT = std.select(
    std.clamp(interpolatedLife / appearWindow, 0, 1),
    d.f32(1),
    u.continuous > 0.5
  );
  const appearScale = u.initialScale + (1 - u.initialScale) * appearT;

  let speed = d.f32(0);
  if (u.textureMode > 0.5 || u.motionBlurAmount > 0.001) {
    speed = std.length(rt.vel);
  }

  // The default Skia-parity material is flat. Avoid four trigonometric
  // functions and a normalization per vertex unless a 3D material requests
  // the procedural bend.
  let zBend = d.f32(0);
  let bendAmplitude = d.f32(0);
  let nBody = d.vec3f(0, 0, 1);
  if (u.textureMode > 0.5) {
    const minSide = std.min(width, height);
    const phase = interpolatedLife * 4.5 + spawn.info.w * 6.28318;
    const bendAmp = minSide * (0.12 + 0.25 * std.clamp(speed / 600, 0, 1));
    bendAmplitude = bendAmp;
    const sU = std.sin(u0 * 6.28318 + phase);
    const cU = std.cos(u0 * 6.28318 + phase);
    const sV = std.sin(v0 * 3.14159);
    const cV = std.cos(v0 * 3.14159);
    zBend = bendAmp * sU * sV;

    const dzdu = bendAmp * 6.28318 * cU * sV;
    const dzdv = bendAmp * 3.14159 * sU * cV;
    const dzdx = dzdu / std.max(width, 0.0001);
    const dzdy = dzdv / std.max(height, 0.0001);
    nBody = std.normalize(d.vec3f(-dzdx, -dzdy, 1));
  }

  const lateralDamp = std.mix(0, 1, u.drift);
  let centerWorld = d.vec3f(interpolatedPos);
  centerWorld.x = spawn.pos0.x + (centerWorld.x - spawn.pos0.x) * lateralDamp;

  const axisXWorld = rotateByQuaternion(
    interpolatedQuat,
    d.vec3f(width * 0.5 * appearScale, 0, 0)
  );
  const axisYWorld = rotateByQuaternion(
    interpolatedQuat,
    d.vec3f(0, height * 0.5 * appearScale, 0)
  );
  const axisZWorld = rotateByQuaternion(
    interpolatedQuat,
    d.vec3f(0, 0, zBend * appearScale)
  );
  let motionBlurStretch = d.f32(0);
  let motionBlurDepthExtent = d.f32(0);
  if (u.motionBlurAmount > 0.001 && speed > 1) {
    const velDir = rt.vel / speed;
    motionBlurStretch =
      ((u.motionBlurAmount * std.min(speed, 1200)) / 1200) * 0.6;
    motionBlurDepthExtent =
      std.abs(velDir.z) * height * motionBlurStretch * 0.5;
  }

  // Manual screen-space projection does not get WebGPU's homogeneous near
  // clipping. Cull the complete particle before any perspective division if
  // its rotated, bent, or motion-blurred geometry can reach the camera plane.
  // This decision is independent of vertexIndex, so both triangles disappear
  // together instead of one stretching across the viewport.
  const initialCameraDistance = spawn.pos0.z + u.focalLength;
  const nearPlaneDistance = getParticleNearPlaneDistance(initialCameraDistance);
  const isInFrontOfNearPlane = isParticleInFrontOfNearPlane(
    centerWorld.z + u.focalLength,
    nearPlaneDistance,
    std.abs(axisXWorld.z),
    std.abs(axisYWorld.z),
    bendAmplitude * appearScale,
    motionBlurDepthExtent
  );

  if (!isInFrontOfNearPlane) {
    return {
      position: d.vec4f(2, 2, 0, 1),
      uv: d.vec2f(u0, 1 - v0),
      color: d.vec4f(0),
      normal: d.vec3f(0, 0, 1),
      flagsAndLayers: d.vec3f(flags, textureLayer, maskLayer),
      seedAndRim: d.vec2f(0),
    };
  }

  // Simulation positions are screen-space, matching the Skia renderer and the
  // public `depth` contract (a perspective scale range). Project only the 3D
  // geometry around the particle center. Projecting the center itself pulled
  // above-screen reset positions toward the viewport center and made them
  // visible, while also making recycle thresholds disagree with rendering.
  const projectedCenter = projectParticlePoint(
    centerWorld,
    u.viewport,
    u.focalLength
  );
  const centerScreen = d.vec2f(centerWorld.x, centerWorld.y);
  const perspectiveScale = u.focalLength / (centerWorld.z + u.focalLength);

  let axisXScreen =
    projectParticlePoint(centerWorld + axisXWorld, u.viewport, u.focalLength) -
    projectedCenter;
  let axisYScreen =
    projectParticlePoint(centerWorld + axisYWorld, u.viewport, u.focalLength) -
    projectedCenter;
  const bendScreen =
    projectParticlePoint(centerWorld + axisZWorld, u.viewport, u.focalLength) -
    projectedCenter;

  const yDir0 = normalizeOrFallback2(axisYScreen, d.vec2f(0, 1));
  const xFallback = d.vec2f(-yDir0.y, yDir0.x);
  const minVisibleScale = std.clamp(u.minVisibleScale, 0, 1);
  axisXScreen = clampProjectedAxis(
    axisXScreen,
    xFallback,
    width * 0.5 * appearScale * perspectiveScale * minVisibleScale
  );
  const xDir = normalizeOrFallback2(axisXScreen, d.vec2f(1, 0));
  axisYScreen = clampProjectedAxis(
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
    const blurWorld =
      centerWorld + velDir * ((v0 - 0.5) * height * motionBlurStretch);
    screen =
      screen +
      (projectParticlePoint(blurWorld, u.viewport, u.focalLength) -
        projectedCenter);
  }

  // Continuous particles carry a negative lifetime until their phase begins.
  // Keep their degenerate geometry outside clip space instead of drawing the
  // entire pending population at its spawn row.
  let clip = toClip(screen);
  if (interpolatedLife < 0) {
    clip = d.vec2f(2, 2);
  }
  const N = rotateByQuaternion(interpolatedQuat, nBody);
  const V = d.vec3f(0, 0, -1);
  let rim = d.f32(0);
  let iSeed = d.f32(0);
  if (u.textureMode > 0.5) {
    rim = 1 - std.abs(std.dot(N, V));
    iSeed = std.fract(std.sin(d.f32(instanceIndex) * 12.9898) * 43758.5453);
  }

  return {
    position: d.vec4f(clip, 0, 1),
    uv: d.vec2f(u0, 1 - v0),
    color: d.vec4f(
      renderLayout.$.palette[colorIdx]!.rgb,
      renderLayout.$.palette[colorIdx]!.a * u.opacity
    ),
    normal: N,
    flagsAndLayers: d.vec3f(flags, textureLayer, maskLayer),
    seedAndRim: d.vec2f(iSeed, rim),
  };
});

export const confettiFragment = tgpu.fragmentFn({
  in: VertexOut,
  out: d.vec4f,
})((input) => {
  'use gpu';

  const u = renderLayout.$.uniforms;
  const flags = d.u32(input.flagsAndLayers.x);
  const isGlossy = (flags & d.u32(SIZE_FLAG_GLOSSY)) !== 0;
  const isTextured = (flags & d.u32(SIZE_FLAG_TEXTURED)) !== 0;
  const hasShapeMask = (flags & d.u32(SIZE_FLAG_SHAPE_MASK)) !== 0;
  const rim = input.seedAndRim.y;
  const seed = input.seedAndRim.x;
  const mode = d.u32(u.textureMode);

  let texColor = d.vec4f(1);
  if (isTextured) {
    texColor = std.textureSampleLevel(
      renderLayout.$.textures,
      renderLayout.$.sampler,
      input.uv,
      d.i32(input.flagsAndLayers.y),
      0
    );
  }
  let maskAlpha = d.f32(1);
  if (hasShapeMask) {
    maskAlpha = std.textureSampleLevel(
      renderLayout.$.shapeMasks,
      renderLayout.$.sampler,
      input.uv,
      d.i32(input.flagsAndLayers.z),
      0
    ).r;
  }
  const paletteRgb = input.color.rgb;
  const texAlpha = std.select(d.f32(1), texColor.a, isTextured);

  if (mode === 0) {
    let skiaColor = d.vec3f(paletteRgb);
    if (isTextured) {
      skiaColor = d.vec3f(texColor.rgb);
    } else if (isGlossy) {
      const lighter = paletteRgb + (d.vec3f(1) - paletteRgb) * 0.35;
      skiaColor = std.mix(
        lighter,
        paletteRgb,
        std.clamp(input.uv.y / 0.6, 0, 1)
      );
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

  const Nperturbed = std.normalize(
    Nbase + (tang * nDelta.x + bitan * nDelta.y)
  );
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

export const confettiTextureFragment = tgpu.fragmentFn({
  in: VertexOut,
  out: d.vec4f,
})((input) => {
  'use gpu';

  const texColor = std.textureSampleLevel(
    renderLayout.$.textures,
    renderLayout.$.sampler,
    input.uv,
    d.i32(input.flagsAndLayers.y),
    0
  );
  return d.vec4f(texColor.rgb, input.color.a * texColor.a);
});

export type ConfettiPipelines = {
  initPipeline: TgpuComputePipeline;
  runtimeInitPipeline: TgpuComputePipeline;
  computePipeline: TgpuComputePipeline;
  renderPipeline: TgpuRenderPipeline;
  textureRenderPipeline: TgpuRenderPipeline | null;
};

const confettiPipelineCache = new WeakMap<
  TgpuRoot,
  Map<string, ConfettiPipelines>
>();

export const createConfettiPipelines = (
  root: TgpuRoot,
  presentationFormat: GPUTextureFormat,
  includeTexturePipeline: boolean
): ConfettiPipelines => {
  let pipelinesByVariant = confettiPipelineCache.get(root);
  if (!pipelinesByVariant) {
    pipelinesByVariant = new Map();
    confettiPipelineCache.set(root, pipelinesByVariant);
  }

  const key = `${presentationFormat}:${includeTexturePipeline ? 'texture' : 'flat'}`;
  const cached = pipelinesByVariant.get(key);
  if (cached) return cached;

  const pipelines = {
    initPipeline: root.createComputePipeline({
      compute: confettiInit,
    }),
    runtimeInitPipeline: root.createComputePipeline({
      compute: confettiRuntimeInit,
    }),
    computePipeline: root.createComputePipeline({
      compute: confettiCompute,
    }),
    renderPipeline: root.createRenderPipeline({
      vertex: confettiVertex,
      fragment: confettiFragment,
      targets: createAlphaBlendTarget(presentationFormat),
      primitive: {
        topology: 'triangle-strip' as const,
      },
    }),
    textureRenderPipeline: includeTexturePipeline
      ? root.createRenderPipeline({
          vertex: confettiVertex,
          fragment: confettiTextureFragment,
          targets: createAlphaBlendTarget(presentationFormat),
          primitive: {
            topology: 'triangle-strip' as const,
          },
        })
      : null,
  };
  pipelinesByVariant.set(key, pipelines);
  return pipelines;
};
