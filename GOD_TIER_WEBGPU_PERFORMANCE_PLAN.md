# God-Tier WebGPU Performance Plan and Implementation Record

## Outcome

The highest-performance architecture that is safe with the current React Native
WebGPU stack is implemented on this branch:

- Particle state and the complete physical model live on the GPU.
- React JavaScript performs no per-frame animation work.
- One Reanimated UI-runtime display clock drives native WebGPU work.
- Simulation uses a deterministic 120 Hz fixed step with interpolated rendering.
- An active canvas performs one uniform upload, at most one compute dispatch,
  one render pass, one queue submission, and one presentation per display frame.
- Burst renderers submit nothing while idle.
- Pipelines, buffers, samplers, textures, atlases, and typed-array scratch space
  are created outside the hot loop and reused.
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
  | resource creation, start/pause/reset/restart, completion notification
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
- Perform explicit cross-runtime GPU destruction, which is unsafe in the
  current native bridge.

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
  command-buffer sequence. Frame callbacks return the command buffer directly
  and receive timestamps as primitives instead of allocating JavaScript frame,
  descriptor, attachment, submission, and submit-array objects every vsync.
- Origin arrays are also stabilized by semantic value so readiness state changes
  cannot start a resource-rebuild loop.
- Device loss clears the active device and reconnects.
- On iOS, device ownership transfers only after the old frame registration has
  retired and the last presentation has been scheduled.
- Native GPU resources are released by the bridge's native finalizers. Explicit
  destruction across runtimes caused reproducible Dawn/Metal failures and is
  intentionally avoided until upstream ownership becomes safe.

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

Option 1 is the only plausible next step that preserves one renderer and avoids
duplicating the simulation. A direct Metal/Vulkan rewrite is justified only if
physical Release profiling shows the GPU work fits comfortably inside 8.33 ms
but the remaining bridge/presentation overhead still causes missed vsyncs.

Until then, this implementation is the safe performance ceiling of the current
cross-platform React Native WebGPU stack while preserving the full physics and
public behavior.
