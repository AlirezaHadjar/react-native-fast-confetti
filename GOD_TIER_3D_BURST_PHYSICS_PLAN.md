# God-Tier 3D Burst Physics Plan

## Document status

- **Status:** Implementation checkpoint complete; physical-device GPU timing and
  the remaining conformance gates are still required for final acceptance.
- **Scope:** WebGPU PI and Cannon confetti. Standard and Continuous supply the
  shared physics core but must not regress.
- **Audience:** The implementing agent and a separate reviewer/auditor.
- **Required outcome:** PI and Cannon must look materially closer to thin pieces
  of paper moving through air while retaining their existing product semantics
  and the GPU-first performance architecture.

This plan builds on [ADR 0001](docs/adr/0001-gpu-resident-burst-transforms.md)
and the implemented stateful architecture in
[ADR 0002](docs/adr/0002-stateful-3d-burst-physics.md). ADR 0001 remains the
measured foundation: one per-particle compute transform, four-vertex triangle
strips, and one command submission.

## Executive decision

PI and Cannon will stop owning an independent analytic 2D trajectory model.
Each mode will instead provide a small launch initializer to a shared,
GPU-resident 3D dynamics core:

```text
PI initializer ---------\
Cannon initializer ------+--> shared 3D plate simulation --> compact transform --> render
Standard initializer ----+
Continuous initializer --/
```

The shared core owns position, velocity, quaternion orientation, angular
velocity, aerodynamic response, gravity, coherent wind, contact, and sleeping.
The launch initializer owns only what makes a mode distinct:

- PI: radial distribution, per-origin delay, spray timing, and speed variation.
- Cannon: origin, target-derived aim direction, cone spread, spray timing, and
  speed variation.
- Standard/Continuous: their existing spawn volume and recycling rules.

### Implementation checkpoint — 2026-08-24

The first production path now has GPU initialization, mutable previous/current
state, 1/120-second fixed-step advancement, quaternion orientation,
orientation-dependent drag, safe perspective projection, floor dissipation and
angular sleep, and a compact two-axis render transform. PI and Cannon share the
same shader/resource path while keeping their launch distributions and lifecycle
controllers. Standard and Continuous consume the extracted state,
aerodynamics, turbulence, and projection helpers without changing their public
mode semantics.

Cannon launch directions now occupy a center-weighted solid cone in XYZ rather
than a uniformly filled 2D wedge. Its speed distribution is triangular around
the configured midpoint, which preserves the requested bounds while removing
the equally dense ballistic edge. PI keeps low-discrepancy radial coverage but
rotates the pattern per seed and receives bounded depth direction. Both modes
sample a tiny flake-scale emitter aperture. All of this work occurs only in the
GPU initialization dispatch; the steady frame path is unchanged.

The hot path keeps one reused uniform array, one command encoder, one stateful
compute pass, one render pass, and one submission. A backward lifecycle target
or generation boundary adds initialization to that encoder instead of
integrating negative time. Roots and pipelines are cached per device/variant;
per-instance buffers and atlases are explicitly destroyed after UI-frame and
queue retirement.

There must be no JavaScript particle simulation, per-frame particle upload, or
GPU readback in production. A steady active frame remains one small uniform
write, one command encoder, at most one physics compute pass, one render pass,
one submission, and one presentation. A generation-boundary frame may add one
initialization compute pass inside that same encoder and submission.

## What “realistic” means

The reference object is a light, thin plate of paper, not a point mass and not a
fully general rigid body. Realism is judged by observable behavior:

1. A flake presents a changing area to the airflow as it tumbles.
2. Face-on motion loses speed faster than edge-on motion.
3. Rotation changes the flight path and the flight path influences rotation.
4. Nearby flakes experience related gusts rather than independent white noise.
5. Depth changes perspective continuously without making flakes explode in
   size near the camera.
6. Floor impacts lose energy, transfer some tangential motion into spin, and
   eventually sleep.
7. The same seed and inputs produce the same result at 60 Hz, 90 Hz, and 120 Hz
   presentation rates.

The goal is perceptual physical plausibility at confetti scale. It is not a
computational-fluid-dynamics solver. Particle-particle collisions, a volumetric
air solver, and arbitrary rigid-body meshes are explicitly out of scope.

## Non-negotiable behavioral contracts

The implementation must first encode these contracts as tests. A richer shader
is not allowed to silently redefine them.

### Shared lifecycle

- `autoplay`, `autoStartDelay`, `pause`, `resume`, `reset`, and `restart` retain
  their current meanings.
- `onAnimationStart` and `onAnimationEnd` fire exactly once per applicable
  cycle, never from a per-particle callback.
- Finite, infinite, and floor-settling behavior remain distinct.
- Reset leaves no initialized particle visible at an origin or at the top edge.
- Pausing freezes simulation time exactly; resuming does not integrate the
  wall-clock pause as a giant step.
- Reduced motion retains an evenly distributed subset of the original layout.
- WebGPU `opacityAnimation` is evaluated from each particle's launch-relative
  lifetime. Keyframes remain one shared GPU buffer; no per-frame particle data
  is uploaded and no opacity field is added to persistent particle state.

### PI

- Each origin retains its count, blast position, delay, color/size selection,
  spread, initial speed, speed variation, depth range, and rotation range.
- PI remains a radial celebratory blast. It must not become a continuous
  emitter when `infinite` is enabled; infinity repeats complete PI cycles.
- Origin timing and spray timing remain normalized against the same public
  duration contract.

### Cannon

- Each cannon retains its count, origin, target, cone spread, speed, speed
  variation, color/size selection, depth range, and rotation range.
- The current target is an **aim direction**, not a promise that every flake
  intersects one point. The upgraded model preserves that meaning.
- The mean **initial velocity** of a seeded cannon launch must align with the
  target direction within a documented angular tolerance. Symmetric spread and
  depth sampling must introduce no launch bias; gravity and drag are expected
  to curve the later trajectory.

### Cross-renderer compatibility

WebGPU and Skia need macro-behavior parity—origin, aim, duration, spread,
lifecycle, and settling—not pixel-identical trajectories. The new 3D
aerodynamics are an intentional WebGPU capability unless a later, separately
profiled Skia port is accepted. The documentation and tests must state this
boundary explicitly.

## Physical model

### Coordinate system and units

Use one documented right-handed world space:

- `+x`: screen right.
- `+y`: screen down, matching the public React Native coordinate system.
- `+z`: toward the camera.
- Projection converts world space to screen space only in the transform/render
  stage.

Simulation uses the standard path's proven **screen-space position plus 3D depth**
convention. `x` and `y`, launch velocity, gravity, collision bounds, and recycle
thresholds remain in logical screen pixels; `z` supplies perspective and
orientation depth. This is deliberate: projecting the simulation center would
pull offscreen reset positions toward the viewport center and make render and
recycle thresholds disagree. Public coefficients therefore keep their current
tuning and Phase 1 can share code without changing Standard or Continuous.

Pixel density must not enter the simulation. React Native logical dimensions
drive physics while device-pixel dimensions configure only the presentation
surface. Resizing recreates or deliberately remaps state; it must never mix the
old and new viewport inside one cycle.

Near-plane handling must use a finite safety distance and cull invalid
particles. Do not clamp a near-zero perspective divisor into a huge positive
scale; that is the failure mode that previously produced giant flakes.

### Per-particle state

The minimum authoritative state is:

- current and previous position (`vec3f`);
- current velocity (`vec3f`);
- current and previous unit quaternion (`vec4f`);
- angular velocity (`vec3f`);
- age/lifetime and floor/sleep state;
- immutable spawn/material coefficients and selection metadata.

Use TypeGPU schemas as the only layout authority. In particular, assume a
`vec3f` consumes a 16-byte aligned slot unless `d.memoryLayoutOf` proves a field
can share it. Every buffer proposal must include the exact output of
`d.sizeOf(...)`; handwritten byte offsets are forbidden.

The implemented burst layout reuses the shared runtime schema while retaining a
smaller immutable launch record:

| Record                         | Implemented schema             |         Exact size |
| ------------------------------ | ------------------------------ | -----------------: |
| Immutable burst launch         | `BurstParticleSchema`          |      64 B/particle |
| Mutable previous/current state | shared `ParticleRuntimeSchema` |      96 B/particle |
| Compact projected transform    | `BurstTransformSchema`         |      32 B/particle |
| **Total**                      |                                | **192 B/particle** |

Executable TypeGPU schema tests are the authority for these values. TypeGPU
does not reuse a `vec3f`'s alignment padding for the following scalar in the
runtime record, so it is 96 rather than 80 bytes. The complete three-buffer set
is 11.52 MB at 60,000 particles and 86.4 KB for the normal 450-particle Cannon
scene, below the 15 MB gate.

### Translation

For each fixed simulation step:

1. Calculate coherent wind at the particle's world position and simulation
   time.
2. Calculate relative air velocity `vRelative = velocity - wind`.
3. Rotate `vRelative` into the flake's local frame.
4. Apply stronger quadratic drag along the plate normal and weaker quadratic
   drag in its plane.
5. Rotate the resulting force back to world space.
6. Add gravity and only physically defensible lift/spin coupling.
7. Integrate velocity, then position, with finite-value and terminal-speed
   guards.

`magnusStrength` is not automatically “more realistic.” Existing Standard and
Continuous behavior remains intact because it is already public. For PI and
Cannon defaults, Magnus/lift is enabled only if a controlled visual test and GPU
timing show that it improves paper motion without creating corkscrew
trajectories. Otherwise, orientation-dependent drag and aerodynamic torque are
the preferred burst-mode coupling.

### Rotation

Orientation remains a normalized quaternion—the fourth component is quaternion
state, not a fourth spatial dimension. Rotation must be driven by:

- seeded initial angular velocity;
- aerodynamic torque derived from relative airflow and flake orientation;
- angular damping;
- floor-contact impulse and friction.

Quaternion interpolation must be hemisphere-correct before normalization. A
settled flake may retain a static tilted orientation, but its angular velocity
must converge to zero. No perpetual “worm” rotation is permitted after sleep.

### Wind and turbulence

Wind must be continuous in space and time. Independent random acceleration each
frame is rejected because it produces buzzing and makes results refresh-rate
dependent.

Start with the existing deterministic procedural wind function. Audit it for:

- continuity under small changes in position/time;
- no frame-dependent seed input;
- bounded force;
- acceptable instruction cost.

Only evaluate `@typegpu/noise` as an alternative if it is compatible with the
installed TypeGPU 0.11.8 toolchain and GPU timestamp data justifies it. Do not
add a dependency merely because the function is called “noise.” If a noise
object is used, create and cache it once outside the frame path.

### Floor contact and sleeping

Floor response uses an impulse/contact model rather than the burst path's
analytic absolute-sine bounce:

- resolve penetration to the contact plane;
- apply restitution only while moving into the plane;
- attenuate tangential velocity with friction;
- couple tangential contact to angular velocity within a bounded range;
- decrease bounce energy on every impact;
- sleep after both linear and angular velocity remain below thresholds for a
  minimum stable interval.

Sleeping particles skip force integration, primarily for correctness. Per-lane
early-out saves little while awake lanes remain in the same 64-wide workgroup;
the meaningful system-level saving remains the existing no-submission idle
path. A coherent gust may wake a particle only if the chosen product behavior
allows it; the first version should keep floor-slept particles asleep until
restart for predictable completion.

Restitution, friction, and variation retain the existing `settleOnFloor`
contract. Coefficients must be clamped once during configuration and again at
the GPU trust boundary.

## Integrator selection: prove it, do not worship it

RK4 is not automatically the best GPU choice. Velocity-dependent drag and
quaternion dynamics make higher-order integration attractive, but RK4 requires
roughly four force evaluations per step and may lose more performance than its
extra accuracy is worth.

Build a double-precision CPU reference integrator used only by tests. Compare
these GPU candidates at the same seeded initial conditions:

1. Semi-implicit Euler at 120 Hz—the existing production baseline.
2. Midpoint/Heun RK2 at 120 Hz.
3. Semi-implicit Euler at 240 Hz.

The reference may use RK4 with a very small step. Select the cheapest candidate
that passes all of these over the longest supported cycle:

- position error below 0.5% of viewport height for representative free flight;
- orientation error below 2 degrees before floor contact;
- no energy increase when gravity/wind are disabled and damping is positive;
- target-centroid angular error within the Cannon contract;
- no visible divergence between 60 Hz and 120 Hz presentation.

Keep the current fixed 1/120-second accumulator and interpolation unless this
test demonstrates a failure. Continue to cap work per display frame and retain
unprocessed foreground debt. Treat gaps above the suspension threshold as app
suspension, not physics time.

## Progress-to-simulation-time contract

Stateful burst physics advances from the delta of the existing eased lifecycle
timeline, not directly from wall-clock time. The UI-runtime frame owner keeps
the last target simulation time and a fixed-step accumulator. A forward delta
adds fixed-step debt; display refresh rate only changes interpolation.

- Each particle starts with a negative `life` equal to its origin plus spray
  delay in seconds. Every fixed step advances `life`, but forces and movement
  run only after it reaches zero. This is the single activation state, so a
  particle cannot double-launch or miss a launch at a frame boundary.
- A completed infinite PI/Cannon cycle increments a GPU generation and resets
  the clock and accumulator. The next frame records the initialization dispatch
  followed by the stateful physics/transform dispatch in the **same command
  buffer and submission**. They may be separate compute passes when that makes
  resource ordering clearer; the extra pass is allowed only on generation
  boundaries. Resource construction may
  use its own one-time setup submission before the surface is reported ready;
  that is not an active animation frame.
- `reset` and `restart` use the same generation mechanism. They never try to
  numerically integrate state backward.
- There is no public arbitrary progress-scrubbing API today. If an internal
  target time moves backward for any reason, the renderer must reinitialize the
  generation and advance from zero; silently integrating a negative `dt` is
  forbidden.
- Cycle duration, opacity, easing, and callbacks remain lifecycle scalars. GPU
  generation changes must not add per-particle callbacks or React renders.

The implementation must add scheduler tests for launch exactly-once behavior,
cycle wrap, reset, restart, and backward-time recovery before the analytic path
is removed.

## Launch initialization

Initialization remains an `O(N)` GPU compute dispatch only when a generation is
created or restarted. JavaScript uploads `O(originCount + sizeCount)` compact
configuration, never `O(particleCount)` objects.

### PI initializer

- Preserve the low-discrepancy radial angle distribution rather than clustering
  ordinary random angles.
- Add a true 3D launch cone: the current 2D spread controls projected spread,
  while seeded depth variation supplies a bounded out-of-plane component.
- Seed quaternion and angular velocity independently of color and size lanes.
- Preserve the inverse visibility mapping used for reduced-motion subsets.

### Cannon initializer

- Compute the normalized 3D aim basis once per origin, not once per particle on
  JavaScript.
- Sample the cone with an area-correct distribution so density does not bunch at
  its center or rim.
- Keep the launch centroid aligned with the target direction. Symmetric depth
  and lateral variation must not bias the centroid.
- Preserve speed and spray-delay distributions.

If future product requirements redefine `target` as a point the burst must
reach, add a separate ADR. A bounded shooting solve once per origin would be the
correct architecture; per-particle JavaScript solvers or corrective mid-flight
guidance are rejected.

## Shader and resource architecture

### Shared shader modules

Extract small TypeGPU functions with explicit inputs:

```text
src/webgpu/shaders/physics/
  coordinates.ts       world/screen conversion and near-plane policy
  aerodynamics.ts      relative flow, anisotropic drag, torque
  integration.ts       chosen translational and quaternion integrator
  contact.ts           floor impulse, friction, sleep
  turbulence.ts        deterministic coherent wind
  state.ts             schemas and exact byte-size exports
```

Mode initializers should live beside, but not inside, the shared integrator.
Avoid one enormous shader function: large live value sets can increase register
pressure and occupancy loss. Calculate intermediates near their use, write a
whole TypeGPU struct once, and do not perform repeated writes to individual
storage fields.

Runtime values enter through uniforms/storage bindings. Never capture a mutable
JavaScript value in a `use gpu` closure. Implement against the repository's
installed TypeGPU 0.11.8 API; support for the peer range up to `<0.13` must be
verified by CI rather than assumed from newer documentation.

### Frame command sequence

The target frame is:

```text
write one reused scalar uniform block
create one command encoder
  begin one compute pass
    dispatch shared physics; emit compact render transform from final state
  end compute pass
  begin one render pass
    draw 4 vertices x particle count
  end render pass
finish once
submit once
present once
```

Initialization/restart is a separate one-shot compute dispatch. Pipelines, bind
groups, buffer views, texture views, samplers, render-pass descriptors, and
typed-array scratch storage are created or cached outside the hot path.

If no fixed physics step is due, the renderer still needs an interpolated
transform. The implementation must measure these two designs:

- **A:** always dispatch one lightweight interpolation/transform kernel;
- **B:** render directly from previous/current state on zero-step frames.

Likewise, the 32-byte compact transform is retained only if GPU timestamps show
that its single write plus cheap vertex reads beats four vertex-stage state
reads and quaternion projections. Current deterministic workload analysis
favors compaction, but it is not exempt from measurement after stateful physics
changes the memory traffic.

### Pipeline specialization

Compile out disabled features; do not branch per particle on configuration that
is constant for the whole pass. Limit variants to a small, justified set to
avoid pipeline explosion. A likely maximum is:

- airborne only;
- airborne plus floor contact;
- continuous recycling, if it cannot share the first variant cheaply.

Texture/material differences remain render-pipeline concerns. Pipeline creation
must be prewarmed during resource readiness when supported, never triggered by
the first visible frame.

### Device and cleanup

- Reuse the existing shared-device pattern and honor an injected `GPUDevice`.
- Never destroy an injected device.
- Destroy every owned buffer/texture and close temporary bitmap/native image
  resources on replacement, cancellation, device loss, and unmount.
- Remove UI-frame registration before retiring resources.
- Keep teardown idempotent and safe against device-loss races.
- Repeated mount/unmount and screen switching must converge to a stable memory
  plateau; garbage collection is not a substitute for explicit GPU cleanup.

## Rendering realism without wasting the physics

- Project the full 3D position and rotate the actual rectangle corners by the
  interpolated quaternion. Do not fake a 3D flip by scaling one 2D axis after
  stateful orientation exists.
- Use the rotated plate normal for simple diffuse/specular response. Lighting
  must be branch-specialized by material and must not add trigonometry to the
  default flat-color path unless timings support it.
- Preserve texture atlases and masks; load/rasterize once and reuse them.
- Cull behind-camera, non-finite, fully transparent, and safely offscreen
  particles before expensive fragment work where WebGPU semantics permit it.
- Continue using four-vertex triangle strips. Do not add an index buffer for a
  four-corner instanced quad without measured evidence.
- Do not introduce CPU depth sorting. Confetti is mostly opaque; texture alpha
  remains best-effort draw order unless a separately measured GPU sorting or
  order-independent-transparency design is accepted.

## Performance contract

“Fast” is not a screenshot of an FPS counter. The implementation passes only
with archived measurements from a release build on physical hardware.

### Workload matrix

Use fixed seeds, textures, viewport, duration, and device state for all runs:

| Mode   | Normal kitchen-sink count |                              Pressure count to report |
| ------ | ------------------------: | ----------------------------------------------------: |
| PI     |   2 origins × 500 = 1,000 | iOS: 2 × 20,000 = 40,000; Android: 2 × 5,000 = 10,000 |
| Cannon |     3 origins × 150 = 450 | iOS: 3 × 20,000 = 60,000; Android: 3 × 5,000 = 15,000 |

Pressure mode is a scalability test, not a public 120-FPS guarantee on every
phone. Count scaling must be approximately linear and must never cause device
loss, unbounded memory, or a CPU initialization cliff.

### Hot-path gates

- Zero React renders caused by particle motion.
- Zero per-frame JavaScript particle work.
- Zero per-frame heap/typed-array/resource allocation after warm-up.
- Zero per-particle CPU uploads or readbacks.
- One queue submission and presentation per active display frame.
- No submissions while a finite burst is idle.
- Normal PI and Cannon: GPU compute + render p95 no greater than 2 ms on the
  chosen modern 120-Hz iPhone reference device and no frame over 8.33 ms from
  confetti alone during a 30-second run.
- Normal scenarios: no sustained UI/display cadence loss on the chosen iOS and
  Android reference devices.
- Pressure scenarios: report p50/p95/p99 GPU and CPU time; never replace these
  data with an average FPS number.
- Particle-buffer memory at 60,000 particles: at most 15 MB unless the auditor
  accepts a measured speed/memory tradeoff.
- Ten PI/Cannon screen switches plus ten restarts: memory settles within 10% of
  the post-warm-up plateau after resource retirement and GC.

The fixed numeric device gates must be revised in the ADR if the selected
reference hardware cannot expose timestamp queries. They must not be silently
deleted.

## Measurement procedure

1. Archive the current analytic implementation and the candidate from the same
   release configuration. Record commit, device, OS, temperature/thermal state,
   renderer, count, texture, seed, and screen brightness.
2. Add GPU timestamps when `timestamp-query` is available. Use one shared query
   set, resolve compute/render/frame-span timestamps, guard availability, allow
   only one asynchronous readback in flight, and sample at 2–4 Hz—not every
   frame.
3. Treat the total frame span as authoritative. Per-pass durations can overlap
   on some architectures and must not be blindly summed.
4. Use Xcode Time Profiler for CPU submission/lifecycle cost and Metal System
   Trace on a physical iPhone for GPU/display evidence. Simulator traces may
   validate CPU call trees and correctness only; they cannot prove Metal GPU
   time.
5. Use the Android system profiler/Perfetto equivalent on a physical Android
   reference device. Separate UI cadence, render-thread work, and GPU queue
   duration.
6. Add signposts around resource creation, initialization dispatch, steady-state
   frame encoding, submit, present, reset, and teardown.
7. Warm each pipeline and atlas, then record at least five 30-second runs per
   scenario. Report median run plus p50/p95/p99 frame data and worst frame.
8. Profile first launch, steady flight, first floor impact, settled idle,
   restart, infinite-cycle boundary, unmount, and device loss separately.
9. Keep raw traces and a short machine-readable result table under a documented
   ignored profiling directory; summarize accepted numbers in the ADR.

The prior Simulator Time Profiler samples were noisy and overlapping. They are
useful evidence that the compact-transform command path did not create a stable
CPU bottleneck, but they are not GPU proof and cannot be converted into a
claimed speedup percentage.

## Correctness test plan

Shader behavior needs two complementary test layers:

1. Pure TypeScript reference math supplies high-accuracy expected values and
   property tests. Its constants and formulas must be generated from or shared
   with a shader-neutral specification module; duplicated magic coefficients
   are forbidden.
2. A development-only WebGPU conformance harness dispatches the actual TypeGPU
   compute pipeline on a small fixed particle set and reads state back at named
   fixed-step counts. Those golden readbacks prove the generated WGSL agrees
   with the reference. Production code never performs this readback.

If CI cannot expose a WebGPU adapter, store reviewed physical-device goldens and
run the harness in the kitchen-sink profiling job. The replacement ADR must say
which layer ran in CI and which ran on devices; a TypeScript mirror alone is not
evidence that the shader is correct.

### Mathematical/property tests

- Quaternion norm remains within tolerance over long runs.
- Every state and transform remains finite under minimum/maximum public inputs.
- With forces disabled, constant velocity matches the analytic trajectory.
- With gravity only, the GPU path matches the ballistic reference.
- With drag and no driving force, kinetic energy is monotonically non-increasing
  within integration tolerance.
- Terminal velocity converges to the reference bound.
- A floor impact never increases total normal kinetic energy when restitution
  is in `[0, 1]`.
- Friction never increases tangential speed.
- Sleeping forces both linear and angular motion below their thresholds and
  prevents later drift.
- Near-plane crossing culls cleanly and never generates a giant or non-finite
  quad.
- Seeded cone/radial sampling is unbiased and deterministic.

### Lifecycle and parity tests

- 60/90/120-Hz presentation schedules produce equivalent authoritative state
  at matching fixed-step boundaries. Rendered interpolation is compared only
  at matching interpolation alpha because presentation frames legitimately
  sample different points between steps.
- A long foreground frame retains bounded fixed-step debt; a suspension gap is
  discarded according to the existing scheduler contract.
- PI origin delays and Cannon spray delays launch exactly once per cycle.
- Infinite PI repeats complete bursts and never mutates into Continuous mode.
- Reset, restart overrides, reduced motion, opacity, floor settling, and
  callbacks retain current behavior.
- Count changes never dispatch or draw against a stale smaller buffer.
- Device loss and cancellation cannot submit against destroyed resources.

### Visual acceptance scenes

Use fixed seeds and side-by-side recordings for:

- face-on versus edge-on drag;
- calm air versus coherent gust;
- shallow versus deep Cannon cone;
- floor bounce through complete sleep;
- textured snowflake near the camera/near plane;
- normal and pressure counts;
- 60-Hz and 120-Hz presentation.

Visual review cannot replace numeric profiling, and numeric profiling cannot
approve implausible motion. Both are required.

## Implementation phases and audit gates

### Phase 0 — Freeze the baseline

- Disable pressure mode for ordinary examples; retain the single switch for
  benchmark runs.
- Add deterministic PI/Cannon benchmark scenes and record current lifecycle,
  trajectories, memory, and GPU/CPU timings.
- Capture development-only GPU readbacks of Standard, Continuous, PI, and
  Cannon state/transform buffers at fixed seeds and fixed step/progress points.
  Commit reviewed golden data or a reproducible generator so Phase 1's
  no-behavior-change gate is executable.
- Record exact TypeGPU schema sizes.

**Gate:** The auditor can replay the baseline from written instructions and
obtain results within an explained variance band.

### Phase 1 — Extract shared math with no behavior change

- Move quaternion, projection, finite guards, and existing standard dynamics
  helpers into shared shader modules.
- Point the standard path at them without changing generated behavior.
- Add the CPU reference and property tests.

**Gate:** Standard/Continuous golden tests and measurements do not regress.

### Phase 2 — Introduce stateful burst resources

- Add immutable spawn and mutable runtime buffers to burst resources.
- Keep current analytic output available only behind a test/build comparison
  flag; do not ship a permanent dual-path public switch.
- Implement complete cleanup and device-loss behavior before animation work.

**Gate:** Repeated initialize/restart/unmount tests show bounded memory and no
stale-buffer dispatch.

### Phase 3 — Implement 3D mode initializers

- Port PI radial and Cannon targeted-cone generation to the new state.
- Generate quaternion/angular velocity/depth state on GPU.
- Preserve seeded selection, timing, and reduced-motion mapping.

**Gate:** Distribution and lifecycle tests pass before aerodynamics are enabled.

### Phase 4 — Enable shared dynamics

- Add translation, orientation-dependent drag, torque, quaternion integration,
  coherent wind, interpolation, and finite guards.
- Select the integrator through reference error plus GPU timing, not preference.

**Gate:** Mathematical tests pass and normal-count GPU time remains inside the
budget before floor logic or rendering polish is added.

### Phase 5 — Contact and sleeping

- Replace analytic bounce with shared contact, friction, spin damping, and
  sleep.
- Verify cycle duration does not cut off legitimate bouncing but does not leave
  immortal motion.

**Gate:** Settling completes predictably for the entire valid configuration
range and sleeping particles stop consuming integration work.

### Phase 6 — Transform and render audit

- Render quaternion-oriented corners with safe perspective.
- A/B compact transform versus direct runtime rendering.
- Specialize the default material fast path and preserve cached atlases.

**Gate:** The accepted path wins GPU frame-span measurements or provides a
documented memory/performance tradeoff accepted by the auditor.

### Phase 7 — Full regression and device profiling

- Run all unit, type, lint, lifecycle, visual, memory, and device scenarios.
- Compare five-run distributions, not a single trace.
- Create the replacement physics ADR with raw workload and measured evidence.
- Remove the analytic comparison path and temporary internal flag.

**Gate:** Every completion criterion below is met. A visually impressive demo
alone is not completion.

## Explicit rejection criteria

Reject the implementation if any of these are true:

- JavaScript or a worklet computes or uploads particle transforms each frame.
- A new device, pipeline, bind group, view, buffer, texture, sampler, typed
  array, or callback wrapper is created in the frame loop.
- Particle state is read back to drive rendering or lifecycle.
- RK4 is selected without reference-error and timestamp evidence.
- “Realism” is implemented as unbounded random noise, permanent rotation,
  exaggerated perspective scale, or hidden extra particle count.
- Cannon targeting is corrected by nonphysical mid-flight steering.
- Particle-particle collision or CPU sorting is added without its own ADR and
  measured budget.
- Simulator Time Profiler data is presented as GPU performance.
- Average FPS is the only performance evidence.
- Cleanup relies on garbage collection to release GPU allocations.
- Public API grows with low-level coefficients before defaults are validated.
- Standard or Continuous silently changes behavior because shared code was
  extracted.

## Definition of done

The transformation is complete only when:

1. PI and Cannon use the shared GPU-resident 3D dynamics core in production.
2. Their macro behavior and full lifecycle contracts pass automated tests.
3. Motion passes the fixed-seed physical/visual acceptance scenes.
4. The selected integrator is the cheapest one that meets quantified error
   bounds.
5. The compact/direct render choice is backed by physical-device GPU timings.
6. Normal scenarios satisfy the CPU, GPU, cadence, and allocation budgets.
7. Pressure scenarios scale linearly, remain stable, and have reported
   p50/p95/p99 data.
8. Repeated restart, screen switching, device loss, and unmount converge to a
   stable memory plateau without native crashes.
9. TypeGPU 0.11.8 and the supported peer range pass type/build tests.
10. The old analytic burst shader and temporary comparison flag are removed.
11. A new ADR records exact schemas, rejected alternatives, trace locations,
    device matrix, and final measurements.
12. An independent agent audits this checklist and finds no unsupported
    “absolute performance” or “real physics” claim.

The practical limit is reached only after the profiler identifies no remaining
material CPU/GPU hotspot that can be removed without breaking the physical or
public behavior contracts. Until that evidence exists, “god tier” is the target,
not the benchmark result.

## Auditor checklist

- [ ] Can every public PI/Cannon behavior be traced to a test?
- [ ] Are world units, axes, projection, and near-plane rules documented?
- [ ] Do exact TypeGPU layout sizes match the ADR's byte table?
- [ ] Is there one authoritative particle state and no per-frame CPU copy?
- [ ] Are all pipelines/resources cached outside the hot loop?
- [ ] Is one command buffer submitted per active frame?
- [ ] Were integrators compared to a high-accuracy reference?
- [ ] Were compact transforms A/B tested with GPU frame-span timestamps?
- [ ] Do results include five-run p50/p95/p99 and worst-frame data?
- [ ] Were measurements taken on physical iOS and Android devices?
- [ ] Are Simulator results labeled CPU-only/inconclusive for GPU claims?
- [ ] Does Cannon remain target-directed without corrective steering?
- [ ] Do floor contacts dissipate energy and reach true angular sleep?
- [ ] Can near-camera flakes ever exceed the documented maximum scale?
- [ ] Is memory stable after restart, switching, device loss, and unmount?
- [ ] Is pressure mode clearly separated from normal product expectations?
- [ ] Were temporary flags and the analytic path removed before completion?
- [ ] Does the final ADR distinguish deterministic workload reductions from
      measured speedups?
