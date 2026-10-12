# God-Tier WebGPU Performance Plan and Implementation Record

## Outcome

The highest-performance architecture that is safe with the current React Native
WebGPU stack is implemented on this branch:

- Particle state and the complete physical model live on the GPU.
- Particle initialization and restart randomization also run in GPU compute;
  React JavaScript never expands a count-sized particle object graph.
- React JavaScript performs no per-frame animation work.
- One Reanimated UI-runtime display clock drives native WebGPU work.
- Simulation uses a deterministic 120 Hz fixed step with interpolated rendering.
- An active canvas performs one uniform upload, at most one compute dispatch,
  one render pass, one queue submission, and one presentation per display frame.
- Burst renderers submit nothing while idle.
- Pipelines, buffers, samplers, textures, atlases, and typed-array scratch space
  are created outside the hot loop and reused.
- Unmount retires the UI frame registration, unconfigures the canvas, destroys
  every owned buffer and texture, then destroys the device after the final
  presentation grace period.
- The public Skia renderer remains the default. WebGPU is an opt-in entry point,
  so existing users do not inherit its native dependencies.

This preserves gravity, anisotropic body-frame drag, wind, Magnus force,
angular damping, quaternion orientation, bounce restitution, floor friction,
motion blur, materials, textures, easing, recycling, reduced motion, lifecycle
methods, and completion callbacks. Particle count and render resolution were not
reduced to manufacture a benchmark win.

## Why the Dedicated Background Runtime Was Rejected on iOS

The original plan assumed that `context.configure()`,
`context.getCurrentTexture()`, queue submission, and `context.present()` could
move to a custom Worklets runtime. A working prototype proved that WebGPU host
objects can execute there, including Worklets bundle mode, but repeated stress
tests also proved that the architecture is not safe on the current iOS bridge.

Those operations reach `CAMetalLayer`. Running them away from the main/UI
runtime produced UIKit layer warnings, incomplete frames, retained swapchain
resources, and native Dawn/Metal failures. Multiple live iOS swapchains could
also corrupt command recording even when submissions were round-robin or used
separate devices.

This is consistent with the upstream React Native WebGPU investigation:

- <https://github.com/wcandillon/react-native-webgpu/issues/244>
- <https://github.com/wcandillon/react-native-webgpu/pull/280>

The current safe design therefore keeps only presentation-sensitive native host
calls on the Reanimated UI runtime. This is not React JavaScript: component
rendering, reconciliation, props, and user callbacks are absent from the frame
path. GPU compute remains the simulation owner.

`react-native-effects` uses a dedicated Worklets runtime and performs WebGPU
presentation there. That is an attractive design, but it does not resolve the
current iOS `CAMetalLayer` constraint demonstrated with React Native WebGPU
0.8.4. Copying that threading model would trade occasional jitter for an
observable native correctness failure.

## Implemented Architecture

```text
React JavaScript (configuration and lifecycle only)
  |
  | compact uniforms + size/origin metadata, lifecycle notification
  v
Shared control values + immutable GPU resource closures
  |
  v
One native UI-runtime vsync coordinator
  |-- reads compact control state
  |-- advances a fixed-step accumulator
  |-- writes one reused uniform array
  |-- encodes compute + render
  |-- submits once
  `-- presents the canvas
  |
  v
WebGPU / Dawn / Metal or Vulkan
  |-- one-shot seeded particle initialization
  |-- authoritative particle state
  |-- 120 Hz physics steps
  `-- instanced rendering with transform interpolation
```

Web uses the same engine and WGSL through the browser frame clock. Android and
web can own independent devices per canvas. iOS permits one active GPU canvas;
additional canvases wait for the current owner to unmount. A single full-screen
presentation surface is also the normal game-engine architecture and is the
fast path confetti overlays should use.

## Fixed-Step Physics and Easing Contract

The simulation step is `1 / 120` second. Each display frame accumulates the
change in the existing eased simulation timeline, not raw wall-clock time. This
preserves the public easing behavior while making the executed physics steps
independent of whether display callbacks arrive at 60 Hz, 120 Hz, or with
foreground jitter.

At most eight physics steps run in one display frame. Remaining time is retained
as debt rather than silently discarded. A wall-clock gap above 250 ms is treated
as suspension/resume and does not attempt to simulate background time. This
prevents a spiral of death without changing foreground simulation results.

The GPU stores previous and current transforms. Rendering uses the residual
accumulator as interpolation alpha, including hemisphere-correct normalized
quaternion interpolation, so 60 Hz presentation does not reduce the physics
rate or show stepwise rotation.

The compute shader retains:

- Gravity with an optional shared, sensor-driven direction.
- Anisotropic drag in particle-local coordinates.
- Procedural wind and spin-dependent Magnus force.
- Angular damping and normalized quaternion integration.
- Terminal velocity and angular-speed guards.
- Restitution and tangential floor friction.
- Continuous and infinite recycling.
- Seeded initialization and finite-value guards where division or
  normalization could degenerate.

Higher-order integration or continuous collision detection was deliberately not
substituted during this optimization. It would alter the shipped trajectory and
cost more GPU arithmetic; it is a physics-model change, not a free performance
optimization.

## Hot-Path Budget

An active native frame is limited to:

1. Read compact shared control values.
2. Calculate the fixed-step count in a caller-owned `Float64Array`.
3. Write one caller-owned uniform block.
4. Encode one compute dispatch when at least one step is due.
5. Encode one instanced render pass.
6. Submit one command buffer and present once.

The hot path does not:

- Invoke React JavaScript or schedule a React render.
- Allocate particle arrays or scratch typed arrays.
- Read particle state back from the GPU.
- Create a device, pipeline, bind group, buffer, sampler, texture, or atlas.
- Rasterize Skia images or SVGs.
- Regenerate spawn data for semantically unchanged props.
- Submit burst frames after the animation is idle.
- Create a new `GPUQueue` JSI wrapper for every write or submission.

## Resource and Lifecycle Strategy

- TypeGPU authors schemas and shaders; raw WebGPU objects are captured by the
  worklet hot loop.
- Resource sets are built off the active path and activated only when the
  device, particle count, and viewport all match.
- A readiness handshake prevents autoplay from consuming its duration before a
  large atlas or pipeline has finished initializing.
- Flake descriptions use semantic identity caching. Equivalent React arrays do
  not rerasterize textures or recreate GPU buffers.
- Easing factories (including cubic Bezier solver creation) resolve once per
  configuration instead of allocating solver closures in every frame.
- The default material skips advanced-material bend trigonometry, velocity
  length, rim/seed calculations, and an unused vertex interpolant. Velocity and
  angular clamps compare squared magnitudes and only take an inverse square root
  when clamping is actually required.
- Native submission reuses coordinator-owned render-pass descriptors and a
  single submit array. The descriptor's swapchain view and submit array are
  cleared in `finally` blocks after every frame, including failed submissions,
  so neither can become a cross-runtime GC root.
- The device queue is cached once per resource set/runtime registration. This
  removed the observed frame-scaled accumulation of hundreds of `GPUQueue` JSI
  wrappers. The submit array and last swapchain view are cleared immediately
  after presentation so they do not become accidental GC roots.
- Origin arrays are also stabilized by semantic value so readiness state changes
  cannot start a resource-rebuild loop.
- Falling confetti uploads a fixed-size initialization uniform plus one record
  per flake size. PI and Cannon upload one compact record per origin. A seeded
  64-thread compute kernel writes particle state directly into its final storage
  buffers, so initialization and restart no longer allocate, pack, or copy
  `O(particleCount)` host data.
- Continuous phase offsets retain exact stratification through a seeded affine
  permutation. This preserves the old even temporal density without uploading
  a shuffled count-sized phase array.
- Reduced-motion subsets are selected by the inverse of the existing evenly
  spaced visibility mapping inside the initialization kernel. They retain the
  full-layout distribution without a JavaScript filter pass.
- Resource activation verifies device, allocation size, atlas identity, and origin
  shape before dispatch or draw. A count change therefore cannot briefly draw
  against a stale, smaller storage buffer.
- Device loss clears the active device and reconnects.
- On iOS, device ownership transfers only after the old frame registration has
  retired, the canvas has been unconfigured, and the last presentation has had
  time to enter Metal's queue.
- The only asynchronous resource-construction stage runs before GPU allocation.
  Its temporary Skia paint, snapshot, and surface objects are explicitly
  disposed, and uploaded or cancelled `ImageBitmap` pixel stores are explicitly
  closed. Completed or cancelled GPU construction destroys every buffer and
  texture. Mounted resource sets do the same on replacement or unmount; device
  destruction is delayed until after UI-runtime retirement. Teardown is
  idempotent and tolerates a device-loss race.
- The Skia comparison path no longer evaluates count-sized burst generation as
  a `useSharedValue` argument on every React render. PI and Cannon retain their
  identical physics in two typed arrays instead of an object graph per particle,
  and falling trajectories use a contiguous `Float32Array`. Layout cleanup
  clears particle, trajectory, sprite, and transform shared values before the
  native canvas is removed.

## Public Packaging

The existing Skia API remains:

```tsx
import { Confetti } from 'react-native-fast-confetti';
```

The WebGPU renderer is explicitly selected:

```tsx
import {
  Confetti,
  ContinuousConfetti,
  PIConfetti,
  CannonConfetti,
} from 'react-native-fast-confetti/gpu';
```

The GPU entry point preserves component names, children, control refs, reduced
motion, and the existing core props. It adds optional wind, Magnus, motion blur,
bounce, floor friction, material, iridescence, shadow, and shared gravity
controls.

Required consumer configuration:

- Install compatible `react-native-webgpu`, `typegpu`, Reanimated, Worklets,
  and Skia peers.
- Add the `react-native-webgpu` Expo config plugin for native projects.
- Add `unplugin-typegpu/babel`, the class-static-block transform, and the
  Worklets Babel plugin in the order shown by the kitchen-sink app.
- Use Android API 26 or newer because the native WebGPU path relies on
  `AHardwareBuffer`.

Reanimated 4.5.3 and Worklets 0.11.4 are the validated Expo SDK 56 pair in this
workspace. Worklets 0.12 removes an adapter API used by that Expo/Reanimated
combination, so blindly upgrading those packages is not a performance fix.

## Verification Implemented

Automated tests cover:

- Equal fixed-step counts for 60 Hz and 120 Hz schedules.
- Equivalent elapsed time under jittered callback intervals.
- Catch-up limits that retain, rather than discard, simulation debt.
- Finite, normalized interpolation alpha.
- Spawn/resource packing parity for single, continuous, PI, and cannon modes.
- Seeded deterministic initialization and visual-parity fixtures.
- Semantic flake memoization across equivalent React values.
- Compact falling, PI, and Cannon initialization payloads at 20,000 particles.
- Exact continuous-phase permutation coverage and GPU WGSL kernel resolution.
- Exact field parity between legacy Skia burst objects and the packed PI/Cannon
  buffers, including velocity, timing, depth, rotation, selection, and flags.
- GPU resource cleanup continuing after an individual device-loss exception,
  and resource retirement occurring only after component cleanup.

Build validation covers:

- TypeScript and strict ESLint checks.
- Jest unit and parity suites.
- Builder Bob module and declaration output.
- iOS native compilation and simulator execution.
- Android native debug compilation at API 26.
- Expo web production export.
- Package tarball contents and the `./gpu` export.

The iOS simulator visually exercised single, continuous, PI, and cannon scenes,
including a 1,000-particle PI burst. A single GPU surface remained stable during
extended stress. The simulator is a 60 Hz environment, so it cannot honestly
prove physical-device 120 Hz frame pacing.

### 20,000-count memory profile (Debug simulator)

The profiling workload positively identified each route, used the same installed
development build and renderer menu, waited for initialization, and measured the
process with `footprint`, `vmmap`, `heap`, and `sample`:

| Scenario                                                    |      Effective particles |  Physical footprint |
| ----------------------------------------------------------- | -----------------------: | ------------------: |
| Clean Single WebGPU                                         |                   20,000 |             ~404 MB |
| Clean Cannon WebGPU                                         | 60,000 (20k × 3 origins) |             ~401 MB |
| WebGPU route sequence                                       |          20k → 40k → 60k | ~397–533 MB plateau |
| Single Skia                                                 |                   20,000 |             ~529 MB |
| Cannon Skia before cleanup work                             |                   60,000 |           ~1,372 MB |
| Cannon Skia after eager-generation removal and packed state |                   60,000 |             ~718 MB |

The original ~1.5 GB report was therefore reproducible and causal: it was the
60,000-particle Skia Cannon path plus retained high-water allocations, not the
WebGPU particle buffers. Before the fixes, `heap` also showed roughly 504 live
`GPUQueue` wrappers after a short run. Queue caching reduced that to four in a
clean active scene. Repeated WebGPU screen changes now remain in a bounded band
instead of growing with each mount.

A clean 20,000-particle WebGPU run measured ~402 MB. Cycling Single →
Continuous → PI → Cannon → Single ended at ~427 MB. The bridge-owned command
buffer/texture wrappers rose during the cycle, then fell from roughly 360 to 50
after simulator memory-pressure collections. That proves those wrappers are
collectible rather than retained by the component graph. Their freed allocator
pages need not be returned to the OS immediately, so Activity Monitor's process
footprint is a high-water measurement rather than a live-object count.

These are deliberately Debug-simulator figures. They include Expo development
client, Metro/debug metadata, two Hermes runtimes, Reanimated/Worklets, Skia,
Dawn, and allocator high-water pages. They are not a valid Release-device RAM
SLO. A 20,000-particle falling WebGPU allocation itself is only a few megabytes
of storage buffers; the remaining process footprint is framework and transient
command-encoding overhead.

Raw `xctrace` correctly attached to the simulator's host process, but Xcode 26.6
classified it as macOS: Animation Hitches reported “not supported on this
platform,” and Time Profiler produced an empty/missing-template document. Those
files were rejected as evidence rather than reported as successful traces.
Native `sample`, `heap`, `vmmap`, and `footprint` produced valid data. Final
ProMotion, thermal, and GPU-counter acceptance still requires a Release build
on physical hardware.

## Release Performance Matrix

Before declaring a device-specific 120 Hz service-level objective, profile a
Release build with no debugger on:

| Device class       | Scenes                       | Required observations                                   |
| ------------------ | ---------------------------- | ------------------------------------------------------- |
| ProMotion iPhone   | 400, 2,000, 10,000 particles | callback intervals, hitches, CPU/GPU counters, power    |
| Older 60 Hz iPhone | same                         | sustained 60 Hz, thermal behavior, memory               |
| Midrange Android   | same                         | Choreographer pacing, Vulkan GPU time, thermal behavior |
| Desktop/mobile web | same                         | browser presentation pacing and device-loss recovery    |

For the default 400-particle scene, the target is:

- 120 Hz on a capable foreground device after warm-up.
- p99 callback interval within one 8.33 ms display period during a 30-second
  controlled run.
- No recurring callback interval above 16.67 ms.
- Zero submissions while an animation is idle.
- Identical fixed-step count for an equal eased simulation duration.

Callback intervals are a presentation-pacing proxy, not literal photon times.
GPU timestamp queries should be used only when the adapter exposes them;
otherwise use platform GPU counters. Chaotic long-horizon GPU trajectories are
not compared to a CPU float implementation because vendor math and FMA behavior
make that an invalid correctness gate. Schedule equivalence and short-horizon
invariants are the reliable tests.

## Absolute Optimization Boundary

No evidence-backed cross-platform optimization remains in React JavaScript or
the shader submission architecture without changing behavior:

- Startup and restart are count-independent on React JavaScript. The remaining
  count-scaled work is the unavoidable GPU storage allocation, one parallel
  initialization dispatch, physics compute, and instanced rasterization.

- Moving particles to JavaScript would be substantially worse.
- A background Worklets presentation loop is unsafe on the current iOS bridge.
- Multiple iOS swapchains are unsafe; one surface is already the game-engine
  model and the minimum presentation cost.
- Reducing particle count, resolution, physics forces, or visual materials would
  sacrifice the requested result.
- Adding GPU compaction or indirect draws at normal confetti counts introduces
  more passes than it saves; it should be reconsidered only if physical-device
  profiling proves a 10,000+ particle vertex bottleneck.
- More expensive integrators or collision solvers change the physics model and
  consume additional GPU time.

Further structural improvement now requires one of these native changes:

1. React Native WebGPU lands a safe main-thread `CAMetalLayer` presentation
   bridge while allowing command encoding on a dedicated runtime.
2. React Native WebGPU fixes multiple-swapchain command ownership on iOS.
3. The library gains a single native render view backed directly by Metal on
   iOS and Vulkan on Android, with WebGPU retained for web.
4. React Native WebGPU releases consumed command encoders, pass encoders,
   command buffers, and presented swapchain texture wrappers eagerly instead of
   waiting for the Worklets Hermes GC. This is the remaining source of the
   periodic native-heap sawtooth in an active scene.

Option 1 is the only plausible next step that preserves one renderer and avoids
duplicating the simulation. A direct Metal/Vulkan rewrite is justified only if
physical Release profiling shows the GPU work fits comfortably inside 8.33 ms
but the remaining bridge/presentation overhead still causes missed vsyncs.

Until then, this implementation is the safe performance ceiling of the current
cross-platform React Native WebGPU stack while preserving the full physics and
public behavior.
