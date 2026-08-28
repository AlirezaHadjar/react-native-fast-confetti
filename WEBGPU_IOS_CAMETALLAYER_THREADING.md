# Why Apple surface transitions run on the main thread

## Scope

This document covers the Apple `CAMetalLayer` part of
`patches/react-native-webgpu@0.8.4.patch`. It does not cover Dawn queue
synchronization or the Android transparent `SurfaceView` change.

As of 2026-08-27, the upstream work is split as follows:

- [PR #456](https://github.com/wcandillon/react-native-webgpu/pull/456)
  enables Dawn's implicit device synchronization. It covers concurrent queue,
  device, tick, and present calls from several runtimes.
- [PR #457](https://github.com/wcandillon/react-native-webgpu/pull/457)
  adds the Android `surface-overlay` transparency mode.
- Neither PR moves Apple surface configuration to the main thread.

The PR numbers matter here. PR #456 is the crash and queue-lock PR. PR #457 is
the Android presentation PR.

## What we observed

This library renders WebGPU frames from a Reanimated UI or worklet runtime so
React JavaScript does not drive every frame. During physical-iPhone lifecycle
testing, Xcode reported an Apple layer-thread violation while a WebGPU canvas
was attached or configured. The relevant native path was:

```text
dawn::native::metal::SwapChain::Initialize
dawn::native::metal::Surface::Configure
CAMetalLayer property mutation
```

The warning occurred around canvas mounting, remounting, navigation, app
lifecycle changes, and opening the React Native developer menu. These events
change native surface state while the render runtime may still be active.
Physical iPhones reproduced the behavior more reliably than the simulator.

This was separate from the queue crashes. The local patch first stopped those
with a shared native-queue mutex. PR #456 replaces that hand-written coverage
with Dawn's supported implicit device synchronization and passes the upstream
cross-runtime stress test. Neither mechanism makes UIKit or Core Animation
layer changes legal on a background thread.

[Issue #244](https://github.com/wcandillon/react-native-webgpu/issues/244)
contains the same Apple warning and the same
`SwapChain::Initialize -> Surface::Configure` stack. The issue also makes
broader claims about memory and other WebGPU calls. Our evidence only supports
the narrower rule used by this patch: operations that configure or mutate the
view's `CAMetalLayer` belong on the main thread.

## How the wrong thread was reached

The platform creates the native view on the UI thread, but the old lifecycle
code did not configure the surface there. It latched the new surface, then
adopted it later through one of two paths:

1. `SurfaceInfo::applyPendingAttach()` ran at the next frame boundary on
   whichever runtime called `getCurrentTexture()` or `present()`.
2. `RNWebGPUManager::flushPendingSurfaceTransition()` used React's JS
   `CallInvoker` when no render loop was active.

Both paths could call Dawn's `Surface::Configure` away from the main thread.
Surface adoption also calls `applyCAMetalLayerColorSpace`, which directly
changes the native layer's color space.

Explicit `GPUCanvasContext::configure()`, `unconfigure()`, and a size-driven
reconfigure could also originate from a non-main JSI runtime. Moving our
application's initial `context.configure()` to a UI worklet reduced one entry
point, but it could not fix the native attach, resize, recovery, or third-party
call paths. The native wrapper must enforce the rule itself.

## What the local patch does

On Apple only, the patch moves these infrequent lifecycle operations to the
main thread:

- pending surface adoption and its `Surface::Configure` call;
- the layer color-space update performed during adoption or configuration;
- explicit canvas `configure()` and `unconfigure()`;
- size-driven reconfiguration; and
- the fallback surface-transition flush used by a canvas that is not
  rendering.

`RunOnMainThreadSync` executes inline when the caller is already on main.
Otherwise it dispatches synchronously and returns the result or rethrows the
exception on the calling runtime. Synchronous dispatch is required when the
caller must use the configured surface immediately afterward.

`flushPendingSurfaceTransition` uses `RunOnMainThreadAsync`. It exists to make
a pending attach visible when no frame will consume it, so it does not need to
block the caller.

The patch dispatches before taking the long-lived `SurfaceInfo` lock. This is
intentional. Dispatching synchronously while holding that lock can deadlock if
the main thread is already waiting for the same surface. A reviewer raised
this problem on the older
[PR #280](https://github.com/wcandillon/react-native-webgpu/pull/280).
That draft also moved every `Present` call to main. Do not copy it as-is. The
measured violation came from layer configuration, while a per-frame main
dispatch would add avoidable work to the render path.

## What stays off the main thread

The patch does not move the render loop to main. Normal frame work remains on
the rendering runtime:

- `getCurrentTexture()` when no surface transition or resize is pending;
- command encoding;
- queue writes and submission; and
- `Surface::Present`.

PR #456 supplies the device synchronization needed by those cross-runtime GPU
calls. Main-thread dispatch and Dawn device locking solve different ownership
rules and both are required.

Putting acquisition and presentation on main for every frame would add a
synchronous cross-thread hop at 60 or 120 Hz. It would erase much of the reason
for using a dedicated render runtime. The correct boundary is the rare layer
transition, not the steady frame path.

## Remaining gap in the local patch

The current patch is not a complete upstream implementation. In
`SurfaceInfo::acquireSurfaceTextureLocked()`, a stale or unavailable surface can
still take this recovery path on the rendering runtime:

```cpp
_surface.GetCurrentTexture(&surfaceTexture);
if (!isAcquireSuccess(surfaceTexture)) {
  _surface.Configure(&_config);
  _surface.GetCurrentTexture(&surfaceTexture);
}
```

That `Configure` call has the same `CAMetalLayer` thread requirement. An
upstream fix must route every Apple `Surface::Configure` and `Unconfigure`
entry point through the main-thread transition mechanism, including recovery
after resize, rotation, foregrounding, or a stale drawable. Fixing only
`GPUCanvasContext::configure()` leaves this path behind.

The recovery design must also avoid dispatching to main while holding
`SurfaceInfo::_mutex`. It may need to release and revalidate state after the
main-thread transition, or centralize all configuration in an ordered
main-thread transition queue. Do not add a synchronous main dispatch inside
`acquireSurfaceTextureLocked()` while its caller owns `_mutex`.

## Upstream fix requirements

An upstream PR for this issue should meet these conditions:

1. Enumerate every Apple path that calls `Surface::Configure`,
   `Surface::Unconfigure`, or directly changes the view's `CAMetalLayer`.
2. Run those layer transitions on the main thread, including stale-surface
   recovery.
3. Preserve operation order across attach, configure, resize, unconfigure,
   detach, and reattach.
4. Never synchronously dispatch to main while holding a lock that main may
   acquire.
5. Keep normal texture acquisition, encoding, submission, and presentation on
   the rendering runtime.
6. Build on PR #456 for Dawn device safety instead of adding another queue
   mutex.
7. Keep the Android presentation work from PR #457 out of this Apple-only PR.

## Reproduction and validation

Use a physical iPhone and Xcode. The simulator did not reproduce the original
warning and lifecycle timing as reliably.

1. Run an active WebGPU animation from a UI or worklet runtime.
2. Repeatedly mount and unmount the canvas by navigating between screens.
3. Open and dismiss the React Native developer menu while rendering.
4. Background and foreground the app.
5. Rotate or resize while rendering so the acquire-recovery path runs.
6. Enable Xcode's Main Thread Checker and inspect any stack containing
   `SwapChain::Initialize`, `Surface::Configure`, or `CAMetalLayer` mutation.

The local combined patch previously completed ten physical-device Stop and Run
cycles without the off-main-layer warning. That result confirms the common
attach and configuration paths, but it does not cover the stale-surface
recovery gap above. The upstream regression test must exercise that path
directly.

## Related upstream work

- [Issue #244: iOS layer modifications off main thread](https://github.com/wcandillon/react-native-webgpu/issues/244)
- [PR #280: run CAMetalLayer operations on main thread](https://github.com/wcandillon/react-native-webgpu/pull/280)
- [PR #339: context lifecycle rewrite](https://github.com/wcandillon/react-native-webgpu/pull/339)
- [Issue #349: crash while switching onscreen during rendering](https://github.com/wcandillon/react-native-webgpu/issues/349)
- [PR #456: Dawn implicit device synchronization](https://github.com/wcandillon/react-native-webgpu/pull/456)
- [PR #457: Android transparent SurfaceView overlay](https://github.com/wcandillon/react-native-webgpu/pull/457)
