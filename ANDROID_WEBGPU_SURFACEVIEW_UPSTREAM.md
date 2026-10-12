# Android transparent WebGPU `TextureView` bottleneck

## Scope

This document covers one issue only: transparent Android WebGPU canvases use a
`TextureView`, which creates a major compositor bottleneck for a full-screen
canvas that changes every frame. It documents the local `SurfaceView` patch,
why the surface must be topmost for this overlay use case, the measured result,
and the compatibility constraints an upstream solution must preserve.

This is an Android presentation/composition issue in `react-native-webgpu`. It
is not a particle-physics issue and it is not a React Native Skia renderer bug.
“HWUI/Skia” below refers to Android's renderer for the React Native app window.

## Upstream behavior

In `react-native-webgpu@0.8.4`, `WebGPUView.setTransparent(true)` creates a
`WebGPUTextureView`. WebGPU renders into its `SurfaceTexture`, then Android
HWUI samples that texture into the React Native window buffer before
SurfaceFlinger composes the window for display.

For a full-screen transparent animation, every frame follows this path:

1. WebGPU renders into the `SurfaceTexture`.
2. HWUI/Skia samples the full-screen texture into the app-window buffer.
3. SurfaceFlinger composes the app window for display.

The second full-screen pass is the bottleneck. It also makes the React Native
window swap whenever WebGPU publishes a new texture. The cost scales strongly
with canvas area and refresh rate, even when the particle simulation itself is
fully GPU-resident.

`TextureView` is still a reasonable general default. It behaves like ordinary
View-tree content and supports clipping, transforms, alpha, and sibling
interleaving. The problem is that this flexibility is expensive for an
always-animating, full-screen transparent overlay.

## Local patch

The tracked patch is:

`patches/react-native-webgpu@0.8.4.patch`

For transparent canvases, it replaces `WebGPUTextureView` with a translucent,
topmost `WebGPUSurfaceView`:

```java
public WebGPUSurfaceView(
    Context context,
    WebGPUAPI api,
    boolean transparent
) {
  super(context);
  mApi = api;
  if (transparent) {
    setZOrderOnTop(true);
    getHolder().setFormat(PixelFormat.TRANSLUCENT);
  }
  getHolder().addCallback(this);
}
```

`WebGPUView.setTransparent(true)` then selects it:

```java
if (mTransparent) {
  mView = new WebGPUSurfaceView(ctx, this, true);
} else {
  mView = new WebGPUSurfaceView(ctx, this);
}
```

Opaque canvases keep the existing ordinary `SurfaceView` path.

The result is a dedicated SurfaceFlinger layer. HWUI no longer samples the
WebGPU frame into the React Native window, removing the redundant full-screen
pass and app-window invalidation.

## Why the transparent surface must be topmost

A normal `SurfaceView` is placed behind the app window. Android punches a hole
through the window so the surface can be seen. That model works for an opaque
video, game, map, or camera surface with ordinary Android controls composed
above it.

It does not produce a transparent overlay over the React Native window. In a
controlled test, removing only `setZOrderOnTop(true)` changed the WebGPU layer
from `z=1` to `z=-2`. The full canvas region became black and the React Native
content beneath it disappeared through the window's hole. Restoring
`setZOrderOnTop(true)` returned the layer to `z=1` and restored the expected
transparent composition.

Local evidence:

- `.context/android-perf/single-no-overlay.png`
- `.context/android-perf/single-overlay-restored.png`

`pointerEvents="none"` prevents the canvas from handling input. It has no
effect on native surface ordering.

## Measured result

The same release animation was profiled on the same 60 Hz Android emulator
before and after changing the presentation path:

| Metric                                            | Transparent `TextureView` | Top translucent `SurfaceView` |
| ------------------------------------------------- | ------------------------: | ----------------------------: |
| WebGPU `QueuePresentKHR` cadence                  |                 45.03 FPS |                     59.33 FPS |
| Present intervals over 20 ms                      |                     35.0% |                         2.47% |
| Present intervals over 33 ms                      |                     17.0% |                         0.45% |
| React Native window swaps during steady animation |               332 / ~15 s |                             0 |

Traces:

- `.context/android-perf/confetti-android-release-baseline.perfetto-trace`
- `.context/android-perf/confetti-android-release-final.perfetto-trace`

The patched build also exposed the canvas as a separate SurfaceFlinger
`SurfaceView(BLAST)` layer. The improvement was therefore verified at the
composition layer and was not inferred from an FPS overlay.

## Compatibility limitations

A top translucent `SurfaceView` is the correct fast path for this confetti
overlay, but it cannot silently replace `TextureView` for every transparent
WebGPU canvas:

1. `setZOrderOnTop(true)` places the surface above the host app window. React
   Native siblings, native navigation headers, and in-window modals cannot be
   drawn above it.
2. A `SurfaceView` is a separate native surface. It does not support arbitrary
   clipping, alpha, transforms, and sibling interleaving like a `TextureView`.
3. Transparency still requires final blending. The patch removes the HWUI
   texture-sampling pass, but it cannot guarantee hardware-overlay/direct
   scanout on every device.
4. Devices expose a limited number of hardware overlay planes. Multiple
   SurfaceViews may fall back to GPU client composition.
5. Ordering several topmost SurfaceViews requires explicit platform testing.
   A single full-screen overlay is the intended fast-path configuration.

These are presentation semantics, not incidental implementation details. The
upstream API must let the caller choose them deliberately.

## Recommended upstream API

Preserve the current compatibility behavior as `auto` and expose presentation
selection explicitly. For example:

```ts
type AndroidPresentation = 'auto' | 'texture' | 'surface' | 'surface-overlay';
```

Suggested behavior:

- `auto`: preserve the current behavior—opaque uses `SurfaceView`, transparent
  uses `TextureView`.
- `texture`: force ordinary View-tree composability.
- `surface`: force a normal behind-window `SurfaceView`.
- `surface-overlay`: use `PixelFormat.TRANSLUCENT` and
  `setZOrderOnTop(true)` for a transparent overlay above the app window.

If upstream prefers a smaller API, an explicit boolean such as
`androidSurfaceViewOverlay` would still be safer than changing the meaning of
`transparent`. Its documentation must state that app-window content cannot
render above that surface.

This confetti library should explicitly request `surface-overlay`; it should
not depend on `transparent` implicitly selecting it.

## Upstream verification checklist

1. Render a full-screen transparent canvas that changes every vsync.
2. Compare the existing `TextureView` mode with `surface-overlay` in a release
   build at both 60 Hz and 120 Hz.
3. Confirm the backing layer with `dumpsys SurfaceFlinger`.
4. Measure `QueuePresentKHR` cadence and React Native window swaps in Perfetto.
5. Verify that content below the overlay remains visible.
6. Verify and document that in-window content cannot appear above the overlay.
7. Test opaque `SurfaceView`, transparent `TextureView`, and transparent
   overlay modes independently to prevent a compatibility regression.

## Relevant upstream history

- PR #142 introduced and discussed `TextureView` for transparent rendering,
  including its slower animation behavior:
  <https://github.com/wcandillon/react-native-webgpu/pull/142>
- PR #168 explored multiple Android presentation implementations:
  <https://github.com/wcandillon/react-native-webgpu/pull/168>
- PR #170 discusses Android Hardware Buffer and compositor tradeoffs:
  <https://github.com/wcandillon/react-native-webgpu/pull/170>
- Android `SurfaceView` documentation:
  <https://developer.android.com/reference/android/view/SurfaceView>
- Android compositor profiling background:
  <https://margelo.com/blog/profiling-skia-reanimated-low-end-android>
