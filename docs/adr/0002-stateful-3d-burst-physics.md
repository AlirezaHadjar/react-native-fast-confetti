# ADR 0002: Use stateful GPU-resident 3D physics for PI and Cannon

- Status: Accepted, with physical-device GPU validation pending
- Date: 2026-08-24

## Context

PI and Cannon previously evaluated an analytic 2D trajectory independently of
the stateful 3D model used by Standard and Continuous. Moving particle updates
to JavaScript would make frame cost proportional to count and require a
per-frame CPU-to-GPU upload. Separate Metal and Android implementations would
duplicate the renderer and physics lifecycle.

The target is a deterministic thin-paper simulation with real depth and
orientation while preserving PI's complete radial cycles, Cannon's aimed cone,
pause/reset/restart semantics, floor settling, and one GPU submission per
active frame.

## Decision

PI and Cannon now initialize immutable launch data and mutable state entirely on
the GPU. Each active frame advances a bounded 1/120-second fixed-step schedule,
interpolates previous/current position and quaternion, projects two oriented
flake axes into a compact transform, and draws a four-vertex triangle strip.

The implementation has these boundaries:

- JavaScript/worklets update one scalar uniform block; they never loop over,
  upload, or read back particles.
- The steady frame has one compute pass, one render pass, and one command-buffer
  submission. Initialization can precede compute in the same submission when
  lifecycle time moves backward.
- Lifecycle progress maps to target simulation time. Fixed-step debt is bounded
  per display frame and never converted into a large unstable step.
- Negative particle life represents origin/spray delay, so activation occurs
  once without a separate emitter or per-particle callback.
- Runtime state contains previous/current position, velocity, previous/current
  quaternion, angular velocity, lifetime, and floor energy.
- Aerodynamic acceleration, quaternion integration, projection, coherent wind,
  and state schemas live in shared shader modules. Burst defaults keep wind and
  Magnus disabled until physical-device GPU timing and controlled visual tests
  justify their cost.
- Cannon initialization samples a center-weighted solid cone around its aim
  vector instead of a uniformly filled 2D wedge. PI retains an evenly covered
  radial launch with a seed-rotated phase. Both modes add bounded depth velocity
  and a flake-scale emitter aperture during the one-time initialization pass.
- Perspective uses a finite near-plane policy and culls unsafe particles rather
  than clamping a near-zero divisor into an oversized flake.
- Floor impacts dissipate normal, tangential, depth, and angular energy; angular
  velocity reaches zero when the bounce energy reaches the sleep threshold.

TypeGPU roots and pipeline variants are cached per `GPUDevice`. This is not a
global device: the existing shared-device mechanism still honors an injected
device. The cache prevents identical canvases from creating distinct raw
bind-group-layout and compiled-pipeline identities on every mount. Per-instance
buffers and texture atlases are retired only after the UI frame registration is
removed and `queue.onSubmittedWorkDone()` resolves, then explicitly destroyed.

## Exact GPU memory layout

TypeGPU 0.11.8 schemas and executable tests report:

| Buffer                                 | Bytes per particle |
| -------------------------------------- | -----------------: |
| Immutable `BurstParticleSchema`        |                 64 |
| Mutable shared `ParticleRuntimeSchema` |                 96 |
| Compact `BurstTransformSchema`         |                 32 |
| **Total**                              |            **192** |

That is 86.4 KB for the normal 450-particle Cannon scene and 11.52 MB for its
60,000-particle iOS pressure scene. Uniform, origin, size, palette, and atlas
storage is small and independent of particle count.

## Validation evidence

All measurements below are from an arm64 Release build on an iPhone 17 Pro
Simulator running iOS 26.5. Simulator data validates CPU architecture and
resource behavior; it is not GPU-time evidence.

- Full repository checks: 15 test suites, 82 tests, TypeScript, ESLint, and
  whitespace validation pass.
- Actual TypeGPU resolution tests compile initialization, stateful transform,
  render, and shared physics functions to WGSL.
- Normal infinite Cannon, sampled for 10 seconds after 40 real menu
  mount/unmount cycles: the display-link/worklet/render path appeared in 762 of
  8,694 main-thread samples (8.8%). `presentFrame` accounted for 469 samples,
  including 428 samples waiting for Simulator Metal command scheduling. The
  non-present portion of the complete frame path was therefore about 3.4% of
  sampled main-thread time.
- The earlier 60,000-particle Cannon pressure run showed 580 frame-path samples
  out of 7,787 (7.4%) and a 210.2 MB physical footprint. The comparable normal
  run was 639 of 7,828 (8.2%) and 195.9 MB. This overlap is evidence that CPU
  frame cost does not scale with particle count; it is not a GPU speedup claim.
- Real menu navigation plateaued at 217.6 MB after warm-up, 226.1 MB after 20
  PI/Cannon mounts, and 225.2 MB after 40 mounts. CoreAnimation live memory and
  layer count also plateaued. The final footprint is 3.5% above warm-up, inside
  the 10% retirement gate.
- PI and Cannon were visually sampled across launch, flight, cycle boundary,
  and 40k/60k pressure scenes. No stale-origin particles, near-plane giant
  flakes, device loss, or WebGPU errors were observed.

The Xcode 26.6 command-line Time Profiler recorder saved non-exportable traces
with `Document Missing Template Error` for both Time Profiler and CPU Profiler.
Those failed traces are explicitly excluded from the evidence. Apple `sample`
and `vmmap` supplied the CPU and memory figures above. A physical-iPhone Metal
System Trace or timestamp-query build remains required before accepting an
exact GPU-duration or 120 Hz claim.

## Consequences

Particle motion is now refresh-rate independent and has one authoritative GPU
state. PI and Cannon gain real quaternion orientation, perspective depth,
orientation-dependent flight, interpolation, and dissipative settling without
count-dependent CPU work.

The cost is one 96-byte mutable state record and one 32-byte projected transform
per particle, plus up to eight fixed-step iterations in a recovery frame. The
usual 60/120 Hz path performs one or two iterations. Pressure scenes increase
GPU arithmetic and bandwidth linearly, so physical-device GPU measurements—not
Simulator FPS—decide the final coefficient/feature budget.

## Alternatives rejected

### Per-frame JavaScript or worklet simulation

Rejected because it scales CPU work and uploads with particle count and
reintroduces the bottleneck WebGPU is meant to remove.

### Keep analytic 2D burst trajectories

Rejected because they cannot couple orientation, drag, depth, contact, and
interpolation into one stateful physical model.

### Use the full 96-byte shared spawn record for burst modes

Rejected because burst timing and selection fit in the existing 64-byte launch
record. The smaller design saves 1.92 MB at 60,000 particles without adding a
hot-path decode or upload.

### Create a TypeGPU root and pipelines for every canvas

Rejected because identical layouts receive different native identities and
compiled pipeline state can accumulate across mounts. A per-device weak cache
preserves device interoperability while per-instance allocations still have
explicit ownership and teardown.

### Claim GPU performance from Simulator traces

Rejected. Simulator Metal scheduling dominates portions of the CPU call tree
and does not represent physical-device GPU execution.
