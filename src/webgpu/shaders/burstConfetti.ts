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
import { MAX_SIMULATION_STEPS_PER_FRAME } from '../fixedStepScheduler';
import {
  getParticleNearPlaneDistance,
  isParticleInFrontOfNearPlane,
} from '../perspective';
import {
  integrateQuaternion,
  random01,
  randomRange,
  rotateByQuaternion,
} from './gpuMath';
import { InitSizeSchema } from './sharedSchemas';
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
  computeAirborneAcceleration,
  computeRelativeAirVelocity,
  integrateAngularVelocity,
} from './physics/aerodynamics';
import {
  applyFloorContactFriction,
  updateFloorSleepTime,
} from './physics/contact';
import {
  PARTICLE_RUNTIME_BYTES,
  ParticleRuntimeArraySchema,
  ParticleRuntimeSchema,
} from './physics/state';
import { sampleCenteredUnit, sampleSoftConeDirection } from './physics/launch';
import {
  clampProjectedAxis,
  cullProjectedAxis,
  normalizeOrFallback2,
  projectParticlePoint,
} from './physics/projection';

// One instanced triangle strip per flake. This avoids repeating two vertices
// (and all analytic trajectory math attached to them) for every particle.
export const BURST_VERTS_PER_FLAKE = 4;

export const BurstUniformsSchema = d.struct({
  viewport: d.vec2f,
  visibility: d.f32,
  focalLength: d.f32,

  dt: d.f32,
  time: d.f32,
  stepsThisFrame: d.f32,
  interpolationAlpha: d.f32,

  motionDuration: d.f32,
  gravity: d.f32,
  initialScale: d.f32,
  flipIntensity: d.f32,

  aerodynamics: d.vec4f,

  floor: d.vec4f,
  opacityCurve: d.vec4f,
});

export const BurstParticleSchema = d.struct({
  originAndTiming: d.vec4f,
  velocityAndDepth: d.vec4f,
  rotationAndMeta: d.vec4f,
  indices: d.vec4f,
});

/**
 * Per-particle screen transform generated once per frame by compute.
 * The compute stage projects a full quaternion-oriented flake once per particle
 * and stores two screen-space basis axes. Four lightweight vertex invocations
 * then expand the quad without rereading the 3D runtime record.
 */
export const BurstTransformSchema = d.struct({
  centerAndAxisX: d.vec4f,
  axisY: d.vec2f,
  colorAndOpacity: d.u32,
  flags: d.u32,
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
export const BurstOpacityKeyframeSchema = d.vec2f;

export const BURST_PARTICLE_BYTES = d.sizeOf(BurstParticleSchema);
export const BURST_RUNTIME_BYTES = PARTICLE_RUNTIME_BYTES;
export const BURST_TRANSFORM_BYTES = d.sizeOf(BurstTransformSchema);
export const BURST_SIZE_META_BYTES = d.sizeOf(BurstSizeSchema);
export const BURST_UNIFORMS_BYTES = d.sizeOf(BurstUniformsSchema);

const toFloatOffset = (byteOffset: number) =>
  byteOffset / Float32Array.BYTES_PER_ELEMENT;

/** Float32 indices derived from the TypeGPU schema used by the hot-path upload. */
export const BURST_UNIFORM_FLOAT_OFFSETS = {
  viewportX: toFloatOffset(
    d.memoryLayoutOf(BurstUniformsSchema, (uniforms) => uniforms.viewport.x)
      .offset
  ),
  viewportY: toFloatOffset(
    d.memoryLayoutOf(BurstUniformsSchema, (uniforms) => uniforms.viewport.y)
      .offset
  ),
  visibility: toFloatOffset(
    d.memoryLayoutOf(BurstUniformsSchema, (uniforms) => uniforms.visibility)
      .offset
  ),
  focalLength: toFloatOffset(
    d.memoryLayoutOf(BurstUniformsSchema, (uniforms) => uniforms.focalLength)
      .offset
  ),
  dt: toFloatOffset(
    d.memoryLayoutOf(BurstUniformsSchema, (uniforms) => uniforms.dt).offset
  ),
  time: toFloatOffset(
    d.memoryLayoutOf(BurstUniformsSchema, (uniforms) => uniforms.time).offset
  ),
  stepsThisFrame: toFloatOffset(
    d.memoryLayoutOf(BurstUniformsSchema, (uniforms) => uniforms.stepsThisFrame)
      .offset
  ),
  interpolationAlpha: toFloatOffset(
    d.memoryLayoutOf(
      BurstUniformsSchema,
      (uniforms) => uniforms.interpolationAlpha
    ).offset
  ),
  motionDuration: toFloatOffset(
    d.memoryLayoutOf(BurstUniformsSchema, (uniforms) => uniforms.motionDuration)
      .offset
  ),
  gravity: toFloatOffset(
    d.memoryLayoutOf(BurstUniformsSchema, (uniforms) => uniforms.gravity).offset
  ),
  initialScale: toFloatOffset(
    d.memoryLayoutOf(BurstUniformsSchema, (uniforms) => uniforms.initialScale)
      .offset
  ),
  flipIntensity: toFloatOffset(
    d.memoryLayoutOf(BurstUniformsSchema, (uniforms) => uniforms.flipIntensity)
      .offset
  ),
  normalDrag: toFloatOffset(
    d.memoryLayoutOf(BurstUniformsSchema, (uniforms) => uniforms.aerodynamics.x)
      .offset
  ),
  tangentialDrag: toFloatOffset(
    d.memoryLayoutOf(BurstUniformsSchema, (uniforms) => uniforms.aerodynamics.y)
      .offset
  ),
  rotationalDrag: toFloatOffset(
    d.memoryLayoutOf(BurstUniformsSchema, (uniforms) => uniforms.aerodynamics.z)
      .offset
  ),
  windStrength: toFloatOffset(
    d.memoryLayoutOf(BurstUniformsSchema, (uniforms) => uniforms.aerodynamics.w)
      .offset
  ),
  floorEnabled: toFloatOffset(
    d.memoryLayoutOf(BurstUniformsSchema, (uniforms) => uniforms.floor.x).offset
  ),
  floorRestitution: toFloatOffset(
    d.memoryLayoutOf(BurstUniformsSchema, (uniforms) => uniforms.floor.y).offset
  ),
  floorFriction: toFloatOffset(
    d.memoryLayoutOf(BurstUniformsSchema, (uniforms) => uniforms.floor.z).offset
  ),
  floorVariation: toFloatOffset(
    d.memoryLayoutOf(BurstUniformsSchema, (uniforms) => uniforms.floor.w).offset
  ),
  opacityKeyframeCount: toFloatOffset(
    d.memoryLayoutOf(BurstUniformsSchema, (uniforms) => uniforms.opacityCurve.x)
      .offset
  ),
  opacityDuration: toFloatOffset(
    d.memoryLayoutOf(BurstUniformsSchema, (uniforms) => uniforms.opacityCurve.y)
      .offset
  ),
  presetViewportPadding: toFloatOffset(
    d.memoryLayoutOf(BurstUniformsSchema, (uniforms) => uniforms.opacityCurve.z)
      .offset
  ),
  presetTimeline: toFloatOffset(
    d.memoryLayoutOf(BurstUniformsSchema, (uniforms) => uniforms.opacityCurve.w)
      .offset
  ),
} as const;

export const BURST_INIT_GENERATION_BYTE_OFFSET = d.memoryLayoutOf(
  BurstInitUniformsSchema,
  (uniforms) => uniforms.counts.w
).offset;

export const BurstParticleArraySchema = (count: number) =>
  d.arrayOf(BurstParticleSchema, count);
export const BurstRuntimeArraySchema = (count: number) =>
  ParticleRuntimeArraySchema(count);
export const BurstTransformArraySchema = (count: number) =>
  d.arrayOf(BurstTransformSchema, count);
export const BurstSizeArraySchema = (count: number) =>
  d.arrayOf(BurstSizeSchema, count);
export const BurstPaletteArraySchema = (count: number) =>
  d.arrayOf(BurstPaletteColorSchema, count);
export const BurstOriginArraySchema = (count: number) =>
  d.arrayOf(BurstOriginSchema, count);
export const BurstOpacityKeyframeArraySchema = (count: number) =>
  d.arrayOf(BurstOpacityKeyframeSchema, count);
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
    runtime: {
      storage: ParticleRuntimeArraySchema,
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
    transforms: {
      storage: d.arrayOf(BurstTransformSchema),
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

export const burstTransformLayout = tgpu
  .bindGroupLayout({
    uniforms: {
      uniform: BurstUniformsSchema,
      visibility: ['compute'],
    },
    particles: {
      storage: d.arrayOf(BurstParticleSchema),
      access: 'readonly',
      visibility: ['compute'],
    },
    runtime: {
      storage: ParticleRuntimeArraySchema,
      access: 'mutable',
      visibility: ['compute'],
    },
    transforms: {
      storage: d.arrayOf(BurstTransformSchema),
      access: 'mutable',
      visibility: ['compute'],
    },
    sizes: {
      storage: d.arrayOf(BurstSizeSchema),
      access: 'readonly',
      visibility: ['compute'],
    },
    opacityKeyframes: {
      storage: d.arrayOf(BurstOpacityKeyframeSchema),
      access: 'readonly',
      visibility: ['compute'],
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

  const presetParticle = burstInitLayout.$.particles[idx]!;
  if (presetParticle.rotationAndMeta.w >= 2) {
    const initialLife = -presetParticle.originAndTiming.z / 1000;
    const initialPosition = d.vec3f(presetParticle.originAndTiming.xy, 0);
    const initialQuaternion = d.vec4f(0, 0, 0, 1);
    burstInitLayout.$.runtime[idx] = ParticleRuntimeSchema({
      pos: d.vec3f(initialPosition),
      life: initialLife,
      prevPos: d.vec3f(initialPosition),
      prevLife: initialLife,
      vel: d.vec3f(0),
      floorBounceScale: d.f32(1),
      quat: d.vec4f(initialQuaternion),
      prevQuat: d.vec4f(initialQuaternion),
      omega: d.vec3f(0),
      floorSleepTime: d.f32(0),
    });
    return;
  }

  const u = burstInitLayout.$.uniforms;
  const seed = u.counts.x + u.counts.w;
  const layoutCount = std.max(u.counts.y, d.u32(1));
  const originCount = std.max(u.counts.z, d.u32(1));
  const layoutIndex = d.u32(
    std.div((idx + d.u32(1)) * layoutCount + count - d.u32(1), count) - 1
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

  let launchDirection = d.vec3f(0, -1, 0);
  let speedUnit = d.f32(0);
  if (mode < 0.5) {
    const phase = random01(originIndex, d.u32(0), seed);
    const turns = d.f32(localIndex) * (137.5 / 360) + phase;
    const centeredDegrees = std.fract(turns) * 360 - 180;
    const angle = -1.57079632679 + centeredDegrees * (halfSpread / 180);
    const depthSlope = randomRange(layoutIndex, d.u32(1), seed, -0.12, 0.12);
    launchDirection = std.normalize(
      d.vec3f(std.cos(angle), std.sin(angle), depthSlope)
    );
    speedUnit = random01(layoutIndex, d.u32(2), seed);
  } else {
    const targetDelta = origin.targetStartAndMode.xy - origin.originAndCount.xy;
    launchDirection = sampleSoftConeDirection(
      targetDelta,
      halfSpread,
      random01(layoutIndex, d.u32(1), seed),
      random01(layoutIndex, d.u32(2), seed)
    );
    speedUnit = sampleCenteredUnit(
      random01(layoutIndex, d.u32(3), seed),
      random01(layoutIndex, d.u32(4), seed)
    );
  }

  const speedMultiplier =
    origin.motion.z + speedUnit * (origin.motion.w - origin.motion.z);
  const depthScale = randomRange(
    layoutIndex,
    d.u32(5),
    seed,
    origin.depth.x,
    origin.depth.y
  );
  const speed = origin.motion.y * u.globals.x * speedMultiplier * depthScale;
  const velocity = launchDirection * speed;
  const launchDelay = randomRange(layoutIndex, d.u32(6), seed, 0, u.globals.y);
  const maxRotationX = randomRange(
    layoutIndex,
    d.u32(7),
    seed,
    origin.rotation.x,
    origin.rotation.y
  );
  const maxRotationZ = randomRange(
    layoutIndex,
    d.u32(8),
    seed,
    origin.rotation.z,
    origin.rotation.w
  );
  const rotationDirection = std.select(
    d.f32(-1),
    d.f32(1),
    random01(layoutIndex, d.u32(9), seed) >= 0.5
  );
  const initialRotation = randomRange(
    layoutIndex,
    d.u32(10),
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
          random01(layoutIndex, d.u32(11), seed) * d.f32(sizeCount - d.u32(1))
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
          random01(layoutIndex, d.u32(12), seed) * d.f32(colorCount - d.u32(1))
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

  const safeFlightDuration = std.max(u.globals.w, 0.0001);
  const timeScale = 1 / std.max(1 - launchDelay, 0.05);
  const originDelaySeconds = std.select(
    d.f32(0),
    origin.originAndCount.z / 1000,
    mode < 0.5
  );
  const activationSeconds =
    originDelaySeconds + launchDelay * safeFlightDuration;
  const initialLife = -activationSeconds * timeScale;
  const focalLength = std.max(u.globals.z, 1);
  const initialZ = focalLength / std.max(depthScale, 0.0001) - focalLength;

  const selectedDimensions = burstInitLayout.$.sizes[sizeIndex]!.dims.xy;
  const emitterRadius = std.clamp(
    std.max(selectedDimensions.x, selectedDimensions.y) * 0.25,
    0.5,
    3
  );
  const emitterDistance =
    std.sqrt(random01(layoutIndex, d.u32(13), seed)) * emitterRadius;
  const emitterAngle = random01(layoutIndex, d.u32(14), seed) * 6.28318530718;
  const emitterDepth =
    (random01(layoutIndex, d.u32(15), seed) * 2 - 1) * emitterRadius;
  const initialPosition = d.vec3f(
    origin.originAndCount.x + std.cos(emitterAngle) * emitterDistance,
    origin.originAndCount.y + std.sin(emitterAngle) * emitterDistance,
    initialZ + emitterDepth
  );

  const quaternionU1 = random01(layoutIndex, d.u32(16), seed);
  const quaternionU2 = random01(layoutIndex, d.u32(17), seed);
  const quaternionU3 = random01(layoutIndex, d.u32(18), seed);
  const quaternionS1 = std.sqrt(std.max(1 - quaternionU1, 0));
  const quaternionS2 = std.sqrt(std.max(quaternionU1, 0));
  const quaternion = d.vec4f(
    quaternionS1 * std.sin(6.28318530718 * quaternionU2),
    quaternionS1 * std.cos(6.28318530718 * quaternionU2),
    quaternionS2 * std.sin(6.28318530718 * quaternionU3),
    quaternionS2 * std.cos(6.28318530718 * quaternionU3)
  );
  const omega =
    d.vec3f(maxRotationX, maxRotationX * 0.125, maxRotationZ) *
    ((rotationDirection * timeScale) / safeFlightDuration);

  burstInitLayout.$.particles[idx] = BurstParticleSchema({
    originAndTiming: d.vec4f(
      initialPosition.xy,
      std.select(d.f32(0), origin.originAndCount.z, mode < 0.5),
      launchDelay
    ),
    velocityAndDepth: d.vec4f(velocity.xy, depthScale, initialRotation),
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
      timeScale
    ),
  });
  burstInitLayout.$.runtime[idx] = ParticleRuntimeSchema({
    pos: d.vec3f(initialPosition),
    life: initialLife,
    prevPos: d.vec3f(initialPosition),
    prevLife: initialLife,
    vel: d.vec3f(velocity),
    floorBounceScale: d.f32(1),
    quat: d.vec4f(quaternion),
    prevQuat: d.vec4f(quaternion),
    omega: d.vec3f(omega),
    floorSleepTime: d.f32(0),
  });
});

/**
 * Resolves trajectory, floor response, rotation, and flip scale once per
 * particle. Keeping this instance-level work out of the vertex shader avoids
 * repeating the same transcendental math for every corner of the quad.
 */
export const burstConfettiTransform = tgpu.computeFn({
  in: {
    gid: d.builtin.globalInvocationId,
  },
  workgroupSize: [64],
})(({ gid }) => {
  'use gpu';

  const idx = gid.x;
  const count = std.arrayLength(burstTransformLayout.$.transforms);
  if (idx >= count) {
    return;
  }

  const u = burstTransformLayout.$.uniforms;
  const particle = burstTransformLayout.$.particles[idx]!;
  const sizeIdx = d.u32(particle.indices.x);
  const size = burstTransformLayout.$.sizes[sizeIdx]!;
  const colorIdx = particle.indices.y;
  const isPreset = particle.rotationAndMeta.w >= 2;
  let runtime = ParticleRuntimeSchema(burstTransformLayout.$.runtime[idx]!);
  const timeScale = std.select(particle.indices.w, d.f32(1), isPreset);
  const localDt = u.dt * timeScale;
  const initialOmega =
    d.vec3f(
      particle.rotationAndMeta.x,
      particle.rotationAndMeta.x * 0.125,
      particle.rotationAndMeta.y
    ) *
    ((particle.rotationAndMeta.z * particle.indices.w) /
      std.max(u.motionDuration, 0.0001));

  if (!isPreset) {
    for (const step of std.range(MAX_SIMULATION_STEPS_PER_FRAME)) {
      if (d.f32(step) < u.stepsThisFrame) {
        runtime.prevPos = d.vec3f(runtime.pos);
        runtime.prevLife = runtime.life;
        runtime.prevQuat = d.vec4f(runtime.quat);
        runtime.life += localDt;

        if (runtime.life >= 0) {
          if (u.floor.x <= 0.5) runtime.floorSleepTime = 0;
          const sleeping =
            u.floor.x > 0.5 &&
            runtime.floorSleepTime >= FLOOR_SLEEP_STABLE_SECONDS;
          if (sleeping) continue;
          const drag = d.vec4f(
            u.aerodynamics.x,
            u.aerodynamics.y,
            u.aerodynamics.z,
            0
          );
          const stepTime = u.time + d.f32(step) * u.dt;
          const relativeAirVelocity = computeRelativeAirVelocity(
            runtime.pos,
            runtime.vel,
            u.aerodynamics.w,
            stepTime
          );
          const acceleration = computeAirborneAcceleration(
            runtime.quat,
            relativeAirVelocity,
            runtime.omega,
            drag,
            d.vec3f(0, u.gravity, 0),
            0
          );
          let nextVelocity = runtime.vel + acceleration * localDt;
          const maximumVelocity = std.max(u.gravity * 1.5, 1);
          const velocityMagnitudeSquared = std.dot(nextVelocity, nextVelocity);
          if (velocityMagnitudeSquared > maximumVelocity * maximumVelocity) {
            nextVelocity =
              nextVelocity *
              (maximumVelocity * std.inverseSqrt(velocityMagnitudeSquared));
          }
          runtime.vel = d.vec3f(nextVelocity);
          runtime.pos = d.vec3f(runtime.pos + runtime.vel * localDt);

          if (u.floor.x > 0.5) {
            const floorPerspectiveDistance = std.max(
              runtime.pos.z + u.focalLength,
              getParticleNearPlaneDistance(
                u.focalLength / std.max(particle.velocityAndDepth.z, 0.0001)
              )
            );
            const perspectiveScale = u.focalLength / floorPerspectiveDistance;
            const floorInset =
              std.length(size.dims.xy) * 0.5 * perspectiveScale;
            const floorY = u.viewport.y - floorInset;
            if (runtime.pos.y > floorY && runtime.vel.y > 0) {
              const floorRandom = std.fract(
                particle.velocityAndDepth.w * 17.17 + d.f32(sizeIdx) * 0.37
              );
              const variation = std.clamp(u.floor.w, 0, 1);
              const restitution =
                std.clamp(u.floor.y + (floorRandom * 2 - 1) * variation, 0, 1) *
                runtime.floorBounceScale;
              runtime.pos.y = floorY;
              runtime.vel.y = -runtime.vel.y * restitution;
              if (
                std.abs(runtime.vel.y) <=
                u.gravity * localDt * (1 + restitution)
              ) {
                runtime.vel.y = 0;
              }
              const frictionRandom = std.fract(floorRandom * 17.17 + 0.37);
              const floorFriction =
                std.clamp(
                  u.floor.z + (frictionRandom * 2 - 1) * variation,
                  0,
                  1
                ) *
                FLOOR_TANGENTIAL_RETENTION *
                std.sqrt(runtime.floorBounceScale);
              const contact = applyFloorContactFriction(
                runtime.vel,
                runtime.omega,
                floorFriction
              );
              runtime.vel = d.vec3f(contact.velocity);
              runtime.omega = d.vec3f(contact.angularVelocity);
              runtime.floorBounceScale *= FLOOR_BOUNCE_DECAY;
            }

            if (runtime.floorBounceScale < 1) {
              runtime.vel.z *= std.max(
                0,
                1 - FLOOR_DEPTH_DAMPING_PER_SECOND * localDt
              );
              const initialZ =
                u.focalLength / std.max(particle.velocityAndDepth.z, 0.0001) -
                u.focalLength;
              runtime.pos.z = std.clamp(
                runtime.pos.z,
                initialZ - u.focalLength * FLOOR_MAX_NEAR_DEPTH_OFFSET,
                initialZ + u.focalLength * FLOOR_MAX_FAR_DEPTH_OFFSET
              );
            }
          }

          let tumbleDrive = d.f32(1);
          if (u.floor.x > 0.5 && runtime.floorBounceScale < 1) {
            tumbleDrive = runtime.floorBounceScale;
          }
          let nextOmega = integrateAngularVelocity(
            initialOmega,
            runtime.omega,
            runtime.quat,
            relativeAirVelocity,
            u.aerodynamics.z,
            tumbleDrive,
            localDt
          );
          if (u.floor.x > 0.5 && runtime.floorBounceScale < 1) {
            nextOmega *= std.max(
              0,
              1 - FLOOR_ANGULAR_DAMPING_PER_SECOND * localDt
            );
            if (runtime.floorBounceScale <= FLOOR_SLEEP_BOUNCE_SCALE) {
              runtime.floorSleepTime = updateFloorSleepTime(
                runtime.floorSleepTime,
                runtime.vel,
                nextOmega,
                localDt
              );
              if (runtime.floorSleepTime >= FLOOR_SLEEP_STABLE_SECONDS) {
                runtime.vel = d.vec3f(0);
                nextOmega = d.vec3f(0);
              }
            } else {
              runtime.floorSleepTime = 0;
            }
          }
          runtime.omega = d.vec3f(nextOmega);
          runtime.quat = d.vec4f(
            integrateQuaternion(runtime.quat, runtime.omega, localDt)
          );
        }
      }
    }
  }

  if (!isPreset) {
    burstTransformLayout.$.runtime[idx] = ParticleRuntimeSchema(runtime);
  }

  const interpolationAlpha = std.clamp(u.interpolationAlpha, 0, 1);
  const interpolatedLife = std.select(
    std.mix(runtime.prevLife, runtime.life, interpolationAlpha),
    u.opacityCurve.w - particle.originAndTiming.z / 1000,
    isPreset
  );
  const opacityKeyframeCount = d.u32(std.max(u.opacityCurve.x, 0));
  let particleOpacity = d.f32(1);
  if (opacityKeyframeCount > d.u32(0) && interpolatedLife >= 0) {
    const activationSeconds = std.select(
      particle.originAndTiming.z / 1000 +
        particle.originAndTiming.w * u.motionDuration,
      particle.originAndTiming.z / 1000,
      isPreset
    );
    const localElapsed = std.select(
      interpolatedLife / std.max(particle.indices.w, 1),
      interpolatedLife,
      isPreset
    );
    const localDuration = std.max(u.opacityCurve.y - activationSeconds, 0.0001);
    const localProgress = std.clamp(localElapsed / localDuration, 0, 1);
    const lastKeyframeIndex = opacityKeyframeCount - d.u32(1);
    const firstKeyframe = burstTransformLayout.$.opacityKeyframes[0]!;
    const lastKeyframe =
      burstTransformLayout.$.opacityKeyframes[lastKeyframeIndex]!;

    if (localProgress <= firstKeyframe.x) {
      particleOpacity = firstKeyframe.y;
    } else if (localProgress >= lastKeyframe.x) {
      particleOpacity = lastKeyframe.y;
    } else {
      let low = d.u32(0);
      let high = lastKeyframeIndex;
      while (high - low > d.u32(1)) {
        const middle = d.u32(std.div(low + high, d.u32(2)));
        const middleKeyframe = burstTransformLayout.$.opacityKeyframes[middle]!;
        if (localProgress < middleKeyframe.x) {
          high = middle;
        } else {
          low = middle;
        }
      }

      const start = burstTransformLayout.$.opacityKeyframes[low]!;
      const end = burstTransformLayout.$.opacityKeyframes[high]!;
      const segmentProgress =
        (localProgress - start.x) / std.max(end.x - start.x, 0.0001);
      particleOpacity = std.mix(start.y, end.y, segmentProgress);
    }
  }
  const opacityByte = d.u32(std.round(std.clamp(particleOpacity, 0, 1) * 255));
  const packedColorAndOpacity =
    (opacityByte << d.u32(24)) | (d.u32(colorIdx) & d.u32(0x00ffffff));

  if (isPreset) {
    const age = std.max(interpolatedLife, 0);
    const horizontalDrag = std.max(particle.velocityAndDepth.z, 0.001);
    const verticalDrag = std.max(particle.velocityAndDepth.w, 0.001);
    const gravity = particle.indices.w;
    const horizontalDisplacement =
      (particle.velocityAndDepth.x * (1 - std.exp(-horizontalDrag * age))) /
      horizontalDrag;
    const verticalDecay = 1 - std.exp(-verticalDrag * age);
    const verticalDisplacement =
      (gravity / verticalDrag) * age +
      ((particle.velocityAndDepth.y - gravity / verticalDrag) / verticalDrag) *
        verticalDecay;
    const normalizedCenter =
      particle.originAndTiming.xy +
      d.vec2f(horizontalDisplacement, verticalDisplacement);
    const centerScreen = normalizedCenter * u.viewport;
    const rotation =
      particle.rotationAndMeta.x + particle.rotationAndMeta.y * age;
    const rotationX = particle.rotationAndMeta.z + particle.indices.z * age;
    const flipDepth = std.clamp(particle.rotationAndMeta.w - 2, 0, 1);
    const rotationXCosine = std.cos(rotationX);
    const projectedHeight = std.select(
      1 - flipDepth * (1 - std.abs(rotationXCosine)),
      rotationXCosine,
      flipDepth >= 0.999
    );
    const scale =
      (particle.originAndTiming.w * u.viewport.x) /
      std.max(std.max(size.dims.x, size.dims.y), 0.001);
    const rotationCosine = std.cos(rotation);
    const rotationSine = std.sin(rotation);
    const axisXScreen =
      d.vec2f(rotationCosine, rotationSine) * (size.dims.x * 0.5 * scale);
    const axisYScreen =
      d.vec2f(-rotationSine, rotationCosine) *
      (size.dims.y * 0.5 * projectedHeight * scale);
    const viewportPadding = std.max(u.opacityCurve.z, 0);
    const visible =
      interpolatedLife >= 0 &&
      normalizedCenter.x >= -viewportPadding &&
      normalizedCenter.x <= 1 + viewportPadding &&
      normalizedCenter.y <= 1 + viewportPadding;

    burstTransformLayout.$.transforms[idx] = BurstTransformSchema({
      centerAndAxisX: d.vec4f(
        std.select(d.vec2f(-10000), centerScreen, visible),
        cullProjectedAxis(axisXScreen, visible)
      ),
      axisY: d.vec2f(cullProjectedAxis(axisYScreen, visible)),
      colorAndOpacity: packedColorAndOpacity,
      flags: d.u32(size.dims.w),
    });
    return;
  }

  const centerWorld = std.mix(runtime.prevPos, runtime.pos, interpolationAlpha);
  const quaternionSign = std.select(
    d.f32(-1),
    d.f32(1),
    std.dot(runtime.prevQuat, runtime.quat) >= 0
  );
  const orientation = std.normalize(
    std.mix(runtime.prevQuat, runtime.quat * quaternionSign, interpolationAlpha)
  );
  const appearWindow = std.max(u.motionDuration * 0.05, 0.0001);
  const appearScale =
    u.initialScale +
    (1 - u.initialScale) * std.clamp(interpolatedLife / appearWindow, 0, 1);
  const axisXWorld = rotateByQuaternion(
    orientation,
    d.vec3f(size.dims.x * 0.5 * appearScale, 0, 0)
  );
  const axisYWorld = rotateByQuaternion(
    orientation,
    d.vec3f(0, size.dims.y * 0.5 * appearScale, 0)
  );
  const initialCameraDistance =
    u.focalLength / std.max(particle.velocityAndDepth.z, 0.0001);
  const visible =
    interpolatedLife >= 0 &&
    isParticleInFrontOfNearPlane(
      centerWorld.z + u.focalLength,
      getParticleNearPlaneDistance(initialCameraDistance),
      std.abs(axisXWorld.z),
      std.abs(axisYWorld.z),
      d.f32(0),
      d.f32(0)
    );
  const projectedCenter = projectParticlePoint(
    centerWorld,
    u.viewport,
    u.focalLength
  );
  let axisXScreen =
    projectParticlePoint(centerWorld + axisXWorld, u.viewport, u.focalLength) -
    projectedCenter;
  let axisYScreen =
    projectParticlePoint(centerWorld + axisYWorld, u.viewport, u.focalLength) -
    projectedCenter;
  const perspectiveScale =
    u.focalLength / std.max(centerWorld.z + u.focalLength, 1);
  const minimumScale = std.clamp(1 - u.flipIntensity, 0, 1);
  const yDirection = normalizeOrFallback2(axisYScreen, d.vec2f(0, 1));
  axisXScreen = clampProjectedAxis(
    axisXScreen,
    d.vec2f(-yDirection.y, yDirection.x),
    size.dims.x * 0.5 * appearScale * perspectiveScale * minimumScale
  );
  const xDirection = normalizeOrFallback2(axisXScreen, d.vec2f(1, 0));
  axisYScreen = clampProjectedAxis(
    axisYScreen,
    d.vec2f(-xDirection.y, xDirection.x),
    size.dims.y * 0.5 * appearScale * perspectiveScale * minimumScale
  );

  burstTransformLayout.$.transforms[idx] = BurstTransformSchema({
    centerAndAxisX: d.vec4f(
      std.select(d.vec2f(-10000), centerWorld.xy, visible),
      cullProjectedAxis(axisXScreen, visible)
    ),
    axisY: d.vec2f(cullProjectedAxis(axisYScreen, visible)),
    colorAndOpacity: packedColorAndOpacity,
    flags: d.u32(size.dims.w),
  });
});

const toClip = tgpu.fn(
  [d.vec2f],
  d.vec2f
)((screen) => {
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

  let uv = d.vec2f(0);
  if (vertexIndex === 1) {
    uv = d.vec2f(1, 0);
  } else if (vertexIndex === 2) {
    uv = d.vec2f(0, 1);
  } else if (vertexIndex === 3) {
    uv = d.vec2f(1, 1);
  }

  const u = burstRenderLayout.$.uniforms;
  const transform = burstRenderLayout.$.transforms[instanceIndex]!;
  const colorIdx = transform.colorAndOpacity & d.u32(0x00ffffff);
  const particleOpacity =
    d.f32(transform.colorAndOpacity >> d.u32(24)) * (1 / 255);
  const flagsU = transform.flags;
  const flags = d.f32(flagsU);
  const textureLayer = d.f32(
    std.bitShiftRight(flagsU, d.u32(SIZE_FLAG_TEXTURE_LAYER_SHIFT)) &
      d.u32(SIZE_FLAG_LAYER_MASK)
  );
  const maskLayer = d.f32(
    std.bitShiftRight(flagsU, d.u32(SIZE_FLAG_MASK_LAYER_SHIFT)) &
      d.u32(SIZE_FLAG_LAYER_MASK)
  );
  const center = transform.centerAndAxisX.xy;
  const axisX = transform.centerAndAxisX.zw;
  const axisY = transform.axisY;
  const screen =
    center + axisX * ((uv.x - 0.5) * 2) + axisY * ((uv.y - 0.5) * 2);
  const clip = toClip(screen);

  return {
    position: d.vec4f(clip, 0, 1),
    uv: d.vec2f(uv.x, 1 - uv.y),
    color: d.vec4f(
      burstRenderLayout.$.palette[colorIdx]!.rgb,
      burstRenderLayout.$.palette[colorIdx]!.a *
        u.visibility *
        particleOpacity
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
  const isGlossy = (flags & d.u32(SIZE_FLAG_GLOSSY)) !== 0;
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
    outputColor = std.mix(
      lighter,
      paletteRgb,
      std.clamp(input.uv.y / 0.6, 0, 1)
    );
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
  transformPipeline: TgpuComputePipeline;
  renderPipeline: TgpuRenderPipeline;
};

const burstPipelineCache = new WeakMap<
  TgpuRoot,
  Map<string, BurstConfettiPipelines>
>();

export const createBurstConfettiPipelines = (
  root: TgpuRoot,
  presentationFormat: GPUTextureFormat,
  useTexturePipeline: boolean
): BurstConfettiPipelines => {
  let pipelinesByVariant = burstPipelineCache.get(root);
  if (!pipelinesByVariant) {
    pipelinesByVariant = new Map();
    burstPipelineCache.set(root, pipelinesByVariant);
  }

  const key = `${presentationFormat}:${useTexturePipeline ? 'texture' : 'mixed'}`;
  const cached = pipelinesByVariant.get(key);
  if (cached) return cached;

  const pipelines = {
    initPipeline: root.createComputePipeline({
      compute: burstConfettiInit,
    }),
    transformPipeline: root.createComputePipeline({
      compute: burstConfettiTransform,
    }),
    renderPipeline: root.createRenderPipeline({
      vertex: burstConfettiVertex,
      fragment: useTexturePipeline
        ? burstTextureFragment
        : burstConfettiFragment,
      targets: createAlphaBlendTarget(presentationFormat),
      primitive: {
        topology: 'triangle-strip' as const,
      },
    }),
  };
  pipelinesByVariant.set(key, pipelines);
  return pipelines;
};
