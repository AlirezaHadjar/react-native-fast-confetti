# React Native WebGPU iOS Queue Crash

## Status

As of 2026-08-23, the crash is fixed locally by the dependency patch in
[`patches/react-native-webgpu@0.8.4.patch`](patches/react-native-webgpu@0.8.4.patch).
The patch is registered in `package.json` and `bun.lock` through Bun's
`patchedDependencies` support. It has not yet been submitted upstream.

This was a native concurrency bug in `react-native-webgpu` 0.8.4. It was not a
confetti physics workload problem, a React render problem, or ordinary GPU
memory pressure.

## User-visible behavior

The app intermittently crashed on a physical iPhone while WebGPU confetti was
running, especially around canvas creation, screen navigation, remounting, and
app relaunches. The most frequent reported trigger for the second crash was
opening the React Native developer menu while the WebGPU animation was active.
The failure was frequent on the physical device but was not reliably
reproducible in the simulator.

The debugger stopped with a signature similar to:

```text
Thread 1: EXC_BAD_ACCESS (code=1, address=0x379dcc491881d8)
```

Depending on which racing operation failed first, Xcode stopped in one of the
Dawn C++ queue wrappers:

```cpp
void Queue::Submit(size_t commandCount,
                   CommandBuffer const *commands) const {
  wgpuQueueSubmit(
      Get(), commandCount,
      reinterpret_cast<WGPUCommandBuffer const *>(commands));
}

void Queue::WriteBuffer(Buffer const &buffer,
                        uint64_t bufferOffset,
                        void const *data,
                        size_t size) const {
  wgpuQueueWriteBuffer(Get(), buffer.Get(), bufferOffset, data, size);
}
```

Other logs seen during the same general lifecycle included GPU device-loss
messages and an Apple warning about mutating a view layer off the main thread.
Those logs were useful evidence, but the device-loss messages were generally a
consequence of teardown rather than the cause of the bad access.

### Second crash signature

The first patch revision serialized direct queue calls and the scheduling wait,
but the app still intermittently aborted in Metal presentation:

```text
SIGABRT
-[IOGPUMetalCommandBuffer encodeSignalEvent:value:]
error: encodeSignalEvent:value: with uncommitted encoder
failed assertion
```

The relevant native stack was:

```text
dawn::native::metal::Queue::SubmitPendingCommandBuffer
dawn::native::metal::SwapChain::PresentImpl
dawn::native::SwapChainBase::Present
dawn::native::Surface::APIPresent
wgpu::Surface::Present
rnwgpu::SurfaceInfo::presentFrame
rnwgpu::GPUCanvasContext::present
```

This was the same synchronization defect at a second entry point, not an
unrelated confetti bug. Dawn's Metal `Surface::Present()` can submit the queue's
pending command buffer. The first revision released the queue mutex after
`WaitForCommandsToBeScheduled()` and before `Surface::Present()`, leaving a
window where another runtime could open a queue encoder before presentation
encoded its signal event.

## Environment where it was reproduced

- `react-native-webgpu`: 0.8.4
- React Native: 0.85.3
- React: 19.2.3
- React Native Reanimated: 4.5.3
- React Native Worklets: 0.11.4
- Kitchen-sink app: `kitchen-sink/ios/Confetti.xcworkspace`
- Renderer: WebGPU
- Particle count: 20,000 (`PERFORMANCE_PARTICLE_COUNT`)
- Target: physical iPhone connected to Xcode
- Scheme: `Confetti`, Debug configuration

The simulator is useful for inspecting activity, but the original
`EXC_BAD_ACCESS` was reproducible only on the physical iPhone during this
investigation. Do not close an upstream report merely because the simulator
does not crash.

## Reproduction procedure

To reproduce the original bug, use an unpatched copy of
`react-native-webgpu@0.8.4`. Do not remove the patch from this working tree just
to reproduce it; use a disposable worktree or a clean checkout of commit
`86197f0` instead.

1. Install dependencies in the unpatched checkout.
2. Open `kitchen-sink/ios/Confetti.xcworkspace` in Xcode.
3. Select the `Confetti` scheme and a connected physical iPhone.
4. Build and run the Debug app from Xcode.
5. Use the renderer control in the navigation header to select WebGPU.
6. Open the **Single** screen. It autoplays an infinite 20,000-particle WebGPU
   animation.
7. While the animation is running, repeatedly open and dismiss the React Native
   developer menu. This was the most reliable trigger for the second,
   `encodeSignalEvent:value:` crash on the physical iPhone.
8. Navigate back and forth between the menu and WebGPU examples so canvases,
   surfaces, devices, and worklet render loops are repeatedly mounted and torn
   down.
9. Also repeat Xcode Stop and Run. The crash was intermittent, so perform
   several cycles rather than treating one successful launch as evidence that
   it is fixed.
10. When Xcode pauses, inspect all threads, not only the selected crashing
    thread. Record the native `WGPUQueueImpl *` address visible in both queue
    paths.

The most revealing state was an active frame performing `GPUQueue::writeBuffer`
on one runtime while a pending surface attach performed an internal blit and
`Queue::Submit` on another runtime. Navigation and launch make this overlap
more likely because they trigger surface adoption while animation work is
already active.

## What Xcode showed

The physical-device crash was inspected live in Xcode. The important evidence
was simultaneous native work against the same Dawn queue:

- One thread was inside `rnwgpu::GPUQueue::writeBuffer`, eventually reaching
  `wgpuQueueWriteBuffer` and Dawn's Metal staging/command-recording code.
- Another thread was inside
  `rnwgpu::SurfaceInfo::blitOffscreenToSurfaceLocked`, which encoded a copy and
  called `wgpu::Queue::Submit`.
- Both paths referenced the same native `WGPUQueueImpl *` value
  (`0x125540000` in the captured run).
- The bad access occurred inside Metal command encoder/capture internals while
  those paths overlapped.
- `SurfaceInfo::applyPendingAttach` could be entered through the React JS
  `CallInvoker`, while frame work was executing through a worklet/rendering
  runtime.
- Apple also emitted an off-main-layer mutation warning, showing that surface
  adoption/configuration could touch `CAMetalLayer` from the wrong thread.

This combination establishes a race. It is stronger evidence than the top
crashing frame alone: `Queue::Submit` and `Queue::WriteBuffer` are both valid
operations, but the wrapper allowed separate JSI runtimes and the surface code
to concurrently enter mutable native queue state.

After the first patch revision, a second live Xcode capture stopped on the main
worklet display-link thread in `rnwgpu::SurfaceInfo::presentFrame`. Metal
asserted that `encodeSignalEvent:value:` was called with an uncommitted encoder.
The Dawn stack passed through `Queue::SubmitPendingCommandBuffer` from
`SwapChain::PresentImpl`. This proved that presentation itself is a queue entry
point and that waiting and presenting must be one indivisible queue-critical
section.

The user reported that this second signature occurred predominantly when the
React Native developer menu was opened over the running animation. Presenting
native debug UI plausibly perturbs UI/frame scheduling while the worklet keeps
issuing WebGPU work, making the unsafe overlap more likely. The captured stack
proves the presentation race, but does not prove the exact mechanism by which
the developer menu changes its frequency. The menu is a trigger, not the root
cause; a correctly synchronized native wrapper must remain safe regardless of
when that overlay is presented.

For supplementary evidence, the simulator Time Profiler export at
`.context/profiles/jitter-2026-08-22/single-time-profile.xml` contains the
`GPUQueue::writeBuffer -> QueueBase::WriteBuffer -> Metal
CommandRecordingContext::EnsureBlit` path. The exact physical-device crash was
inspected in the live Xcode debugger and was not exported as a `.crash` file,
so reproduce on hardware when preparing an upstream report.

## Root cause

There were three related native threading violations.

### 1. One Dawn queue was used concurrently from multiple entry points

A WebGPU queue can be boxed into more than one JSI runtime. The public
`GPUQueue` wrapper issued operations such as `Submit`, `WriteBuffer`, and
`WriteTexture`, while `SurfaceInfo` independently obtained the same device
queue for its offscreen-to-onscreen blit and scheduling wait.

There was no shared synchronization keyed by the native queue. A mutex local
to a React component, a JSI wrapper, or a single runtime would not solve this:
different wrappers can still refer to the same `WGPUQueueImpl`.

### 2. Surface presentation was outside the queue transaction

The first patch revision protected
`dawn::native::metal::WaitForCommandsToBeScheduled`, but released the shared
queue mutex before calling `wgpu::Surface::Present`. Dawn's Metal implementation
can call `SubmitPendingCommandBuffer` from `Present`, so another runtime could
enter `WriteBuffer` in that gap and leave mutable encoder state inconsistent for
the presentation submission.

The correct synchronization boundary is the complete scheduling-wait and
surface-present transaction, not either call in isolation. Surface acquisition,
configuration, unconfiguration, fallback texture creation, and the internal
blit also touch Dawn device/queue/swap-chain state and use the same boundary.

### 3. Apple surface transitions could mutate `CAMetalLayer` off main

Pending surface adoption and `Surface::Configure` could run through the JS
`CallInvoker` or whichever runtime reached the next frame boundary. On Apple,
that work updates the native Metal layer and must be performed on the main
thread.

Moving the entire render loop to the main thread would avoid this warning but
would be a serious performance regression. Only the infrequent layer/surface
lifecycle transition belongs on main; texture acquisition, encoding, queue
submission, and presentation should stay on the rendering runtime.

## Why other explanations were rejected

- **20,000 particles:** High particle counts increase the chance that the race
  overlaps, but they do not make a valid queue pointer spontaneously become an
  invalid memory access. The GPU simulation remains count-scalable.
- **JavaScript frame rate:** The failure was in native Dawn/Metal queue state,
  not a missed React or JavaScript frame.
- **GPU device loss:** `Device was destroyed` commonly appeared during
  lifecycle teardown. It did not explain the simultaneous `Submit` and
  `WriteBuffer` stacks on the same queue.
- **The one-active-canvas warning:** This is a separate app/library policy. It
  can explain waiting canvases, not this native bad access.
- **The transforms/sprites length error:** This is a separate validation error
  in confetti data preparation and is not the native queue race.
- **Memory growth:** Memory and retained GPU resources were investigated
  separately. This crash did not have the signature of an out-of-memory kill.

## The implemented fix

The patch introduces synchronization at the native ownership boundary rather
than hiding the problem at the React layer.

### Shared per-native-queue synchronization

`QueueSynchronization` maintains a process-wide registry keyed by
`WGPUQueue`. Every wrapper or surface path that resolves to the same native
queue receives the same `std::mutex`.

The registry stores weak references and opportunistically removes expired
entries, so repeated device creation/loss cannot grow the registry forever.
`GPUDevice` retains the mutex for the lifetime of the device, preventing raw
queue-handle reuse from producing overlapping lock identities during teardown.

The shared mutex protects:

- `GPUQueue::submit`
- `GPUQueue::writeBuffer`
- `GPUQueue::writeTexture`
- `GPUQueue::copyExternalImageToTexture`
- registration through `GPUQueue::onSubmittedWorkDone`
- queue native label mutation
- surface configure, acquire, unconfigure, and fallback texture creation
- the complete internal `SurfaceInfo` acquire/encode/blit/submit transaction
- the complete Apple
  `WaitForCommandsToBeScheduled -> Surface::Present` transaction
- explicit device destruction and forced device loss

CPU-only image staging remains outside the queue lock so unrelated work does
not extend the critical section.

`SurfaceInfo` caches the shared mutex when the canvas is configured. The normal
per-frame acquire/present path therefore does not perform a registry lookup.

### Main-thread Apple surface lifecycle

On Apple platforms:

- pending native surface adoption is marshalled to the main thread only when
  an actual pending attach exists;
- canvas `configure`, `unconfigure`, and size-driven `reconfigure` run on main;
  and
- the fallback flush for a non-rendering canvas is scheduled on main rather
  than through the JS `CallInvoker`.

Normal `getCurrentTexture`, command encoding, per-frame queue operations, and
presentation remain on the rendering runtime. There is no per-frame main
dispatch in the steady state.

### Lock ordering and lifetime

Every path that needs both locks takes the `SurfaceInfo` lock first and the
shared queue lock second. Public queue operations only take the queue lock and
never acquire `SurfaceInfo`, so there is no inverse queue-to-surface path.
Presentation holds both locks across the scheduling wait and
`Surface::Present`; releasing the queue lock between those calls was the defect
in the first revision.

Main-thread dispatch is performed before taking long-lived surface locks. This
avoids synchronously waiting for main while main is waiting for the same
surface mutex.

## Why this is not a workaround

The patch does not catch or suppress `EXC_BAD_ACCESS`; native bad accesses
cannot be recovered safely. It does not delay initialization, retry failed
submissions, serialize through JavaScript, reduce particle count, disable
worklets, leak devices, or force the render loop onto the main thread.

It enforces the three actual ownership constraints revealed by the traces:

1. Operations sharing one mutable Dawn queue must share one synchronization
   primitive.
2. Surface acquire/encode/present work must participate in that same queue
   transaction, including Dawn's implicit submission during `Present`.
3. Apple native layer configuration must happen on the main thread.

## Patched files

The dependency patch modifies these upstream files:

- `cpp/rnwgpu/SurfaceRegistry.h`
- `cpp/rnwgpu/RNWebGPUManager.cpp`
- `cpp/rnwgpu/RNWebGPUManager.h`
- `cpp/rnwgpu/api/GPUCanvasContext.cpp`
- `cpp/rnwgpu/api/GPUDevice.cpp`
- `cpp/rnwgpu/api/GPUDevice.h`
- `cpp/rnwgpu/api/GPUQueue.cpp`
- `cpp/rnwgpu/api/GPUQueue.h`

Patch SHA-256 at the time this document was written:

```text
332627070f19ae98cc51acefb5f0fbf49480ea8c08795677b784b8e753a283e9
```

If the patch changes, update or remove this checksum rather than assuming a
mismatch means installation corruption.

## Validation already completed

The patched dependency was reinstalled through Bun before validation, so the
checks exercised the packaged patch rather than only hand-edited files in
`node_modules`.

### Automated checks

```sh
bun run typecheck
bun run test -- --runInBand
```

Results:

- TypeScript passed.
- 11 Jest suites passed.
- 39 Jest tests passed.

### Native compilation

```sh
cd kitchen-sink/ios
xcodebuild \
  -workspace Confetti.xcworkspace \
  -scheme Confetti \
  -configuration Debug \
  -destination generic/platform=iOS \
  -derivedDataPath /tmp/confetti-webgpu-patch-derived \
  CODE_SIGNING_ALLOWED=NO \
  -quiet build
```

The full iOS device build passed. Remaining warnings were pre-existing
dependency warnings, not errors introduced by this patch.

### Physical-device stress check

The patched app was built and launched from Xcode on the physical iPhone. Ten
consecutive Stop/Run lifecycle cycles completed with the app running each time.
The Xcode console showed none of the following during those cycles:

- `EXC_BAD_ACCESS`
- `encodeSignalEvent:value: with uncommitted encoder`
- Metal `failed assertion` / `SIGABRT`
- `GPU Device Lost`
- off-main native layer mutation warnings

This is meaningful regression evidence for an intermittent failure, not a
mathematical proof that no other lifecycle race exists. Any future change to
device sharing, canvas ownership, surface attach/detach, or worklet runtime
boxing should repeat the physical-device stress test.

Because the second failure was reported predominantly around the developer
menu, release validation must also include at least ten open/dismiss cycles of
that menu while the 20,000-particle WebGPU animation is active. Stop/Run cycles
alone are not a substitute for this scenario.

## How to verify the patch is installed

From the repository root:

```sh
rg -n "react-native-webgpu@0.8.4" package.json bun.lock
rg -n "class QueueSynchronization" \
  node_modules/react-native-webgpu/cpp/rnwgpu/SurfaceRegistry.h
```

Expected dependency mapping:

```json
{
  "patchedDependencies": {
    "react-native-webgpu@0.8.4": "patches/react-native-webgpu@0.8.4.patch"
  }
}
```

If `node_modules` was replaced, run `bun install`; do not manually reapply
individual edits.

## Guidance for an upstream pull request

An upstream change should preserve the behavioral boundaries of this patch:

- synchronization identity must be the native `WGPUQueue`, not a React
  component or individual JSI wrapper;
- internal surface submissions and public `GPUQueue` calls must use the same
  lock;
- `WaitForCommandsToBeScheduled` and `Surface::Present` must remain inside one
  uninterrupted queue-critical section;
- all paths needing both locks must preserve surface-lock then queue-lock order;
- device destruction must be ordered against outstanding queue entry points;
- only Apple surface/layer lifecycle work should be moved to main;
- the steady-state render hot path must not synchronously dispatch to main;
- add a native regression test if upstream has a harness capable of invoking
  two wrappers/runtimes against one queue; and
- validate on physical iOS hardware with repeated mount/unmount and launch
  cycles; and
- repeatedly open and dismiss the React Native developer menu over an active
  WebGPU canvas, because that was the primary trigger for the second signature.

For the upstream report, export the physical-device crash navigator entry or
an `.xcresult` so the two simultaneous thread stacks and matching
`WGPUQueueImpl *` address are preserved independently of this workspace.

## Fast handoff for the next agent

1. Read this file and the dependency patch before changing queue or surface
   lifecycle code.
2. Confirm `patchedDependencies` still targets exactly
   `react-native-webgpu@0.8.4`.
3. Reproduce only in a disposable unpatched checkout.
4. Treat the physical iPhone and Xcode thread stacks as the source of truth.
5. After any native modification, reinstall the patch, run the automated
   checks, perform a generic iOS device build, and repeat at least ten physical
   Stop/Run or mount/unmount cycles plus ten developer-menu open/dismiss cycles
   over an active WebGPU animation.
6. Do not replace native synchronization with JavaScript state, timeouts,
   retries, reduced particle counts, or a main-thread render loop.
7. Do not split the Apple scheduling wait from `Surface::Present`; the second
   physical-device crash proved that this gap is unsafe.
