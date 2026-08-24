import { d } from 'typegpu';

/**
 * Immutable per-particle inputs shared by every stateful WebGPU simulation.
 *
 * Keep schema ownership in this module so Standard, Continuous, PI, and Cannon
 * cannot silently drift into incompatible physical representations.
 */
export const ParticleSpawnSchema = d.struct({
  pos0: d.vec3f,
  vel0: d.vec3f,
  quat0: d.vec4f,
  omega0: d.vec3f,
  drag: d.vec4f,
  info: d.vec4f,
});

/** Previous and current state are retained for refresh-rate-independent render interpolation. */
export const ParticleRuntimeSchema = d.struct({
  pos: d.vec3f,
  life: d.f32,
  prevPos: d.vec3f,
  prevLife: d.f32,
  vel: d.vec3f,
  floorBounceScale: d.f32,
  quat: d.vec4f,
  prevQuat: d.vec4f,
  omega: d.vec3f,
});

export const PARTICLE_SPAWN_BYTES = d.sizeOf(ParticleSpawnSchema);
export const PARTICLE_RUNTIME_BYTES = d.sizeOf(ParticleRuntimeSchema);

export const ParticleSpawnArraySchema = (count: number) =>
  d.arrayOf(ParticleSpawnSchema, count);

export const ParticleRuntimeArraySchema = (count: number) =>
  d.arrayOf(ParticleRuntimeSchema, count);
