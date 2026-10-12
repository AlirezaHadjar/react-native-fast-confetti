# Graphite and WebGPU dependency upgrade

## Versions

Updated on 2026-10-11 to `react-native-skia` 3.4.0 and
`react-native-webgpu` 0.13.1. Both depend on Dawn 154.3.0. The former
`@shopify/react-native-skia` package ends at 2.14.0; source imports, package
manifests, Jest configuration, and web setup now use `react-native-skia`.
The example app uses the local library via `file:..` to avoid pulling an older
published confetti version with the old Skia peer dependency.

Skia v3 requires Android API 26 with Vulkan and iOS 15.1+. Expo requires a
native development build. The library now declares Skia >=3.4.0 <4 and
WebGPU >=0.13.1 <1. Do not install both Skia package names.

## What Graphite changes for this library

The default entry point still renders through Skia Atlas/Vertices. Its
particle transform updates remain Reanimated worklets; upgrading the Skia
backend does not move those calculations into GPU compute shaders.

The `/gpu` entry point already runs its simulation and rendering through
TypeGPU/WebGPU. Skia still handles colors, path construction, image/SVG
rasterization, and nonrectangular shape masks during initialization. It is
not used to draw each WebGPU animation frame.

Graphite enables shared-device, zero-copy texture interoperability. Our
current texture path still rasterizes to pixels and uploads them to its own
WebGPU device. Taking advantage of interop would require a separate change
to device ownership and texture creation; this upgrade does not implement it.
No frame-rate or memory improvement is claimed without a matched runtime
measurement.

## Local patch audit

- Android overlay selection: PR #457 merged. The dependency patch no longer
  duplicates it. Confetti maps its existing `androidTransparencyMode` option
  to upstream `opaque={false}` and `android={{surfaceType, zOrderOnTop}}`.
  All WebGPU effects now default to TextureView so they follow screen
  navigation. A topmost translucent SurfaceView is an explicit overlay option.
- Device synchronization: PR #456 was closed in favor of #467. The released
  adapter requests Dawn ImplicitDeviceSynchronization by default. The local
  patch no longer overrides requestDevice or device features.
- Apple surface transitions: PR #459 remains open. The released source still
  has background-thread attach flushing and acquire-recovery configuration.
  The remaining patch preserves main-thread configuration/resize/unconfigure,
  attach flushing, recovery outside the surface mutex, and Apple in-flight
  surface retention. It preserves the newer frame-epoch API and Android AHB
  pool and device-release workarounds. Android surface retirement follows
  upstream behavior.

The patch also now clears retired canvas texture wrappers and binds error delivery to the owning runtime; see [the Android renderer fixes](ANDROID_RENDERER_FIX.md).

The remaining patch is `patches/react-native-webgpu@0.13.1.patch`, applied by
Bun. The old 0.8.4 patch is retired. Historical investigation documents describe
older versions and should not be treated as current patch inventories.

## Sources

- [Skia v3 migration](https://wcandillon.github.io/react-native-skia/docs/getting-started/migration/)
- [Skia/WebGPU interop](https://wcandillon.github.io/react-native-skia/docs/webgpu/)
- [WebGPU 0.13.1](https://github.com/wcandillon/react-native-webgpu/releases/tag/v0.13.1)
- [Android presentation PR #457](https://github.com/wcandillon/react-native-webgpu/pull/457)
- [Device synchronization PR #467](https://github.com/wcandillon/react-native-webgpu/pull/467)
- [Apple transition PR #459](https://github.com/wcandillon/react-native-webgpu/pull/459)

## Validation

- Dependency install and library build pass.
- Library and kitchen-sink TypeScript checks pass.
- Jest: 18 suites, 107 tests pass.
- ESLint: no errors; one pre-existing import-order warning in the staged
  resource-cleanup test.
- Production web export passes; CanvasKit WASM refreshed for the new Skia build.
- CocoaPods install passes and confirms matching Dawn versions.
- Apple SurfaceRegistry C++ syntax check passes against Dawn 154.3.0 headers.
- Patch applies cleanly to the pristine 0.13.1 npm source.

Native build and runtime evidence is saved under
`.context/dependency-upgrade/`. The Git index is unchanged by this upgrade.

### Native outcome

Both iOS simulator builds link successfully. The precompiled Expo build
crashed in React/Expo native view-props registration before JavaScript loaded.
Rebuilding Expo modules from source passed; after restarting the test simulator,
both WebGPU and Skia Graphite menu previews visibly rendered and animated.
The kitchen sink now sets `ios.usePrecompiledModules: false` in the existing
expo-build-properties plugin so future prebuilds preserve this choice.

Android production JavaScript export passes. The standard native arm64 debug
build now passes with the project's AGP configuration (2m52s). Maven artifacts
finished downloading; the earlier offline dependency blocker is cleared.

The following captures the initial, pre-fix retest. See
[Android renderer fixes](ANDROID_RENDERER_FIX.md) for the subsequent fixes and
current measurements.

Android retesting on 2026-10-12 used API 36 emulators and a Samsung SM-A736B
with Android 16, Adreno 642L, and a 120 Hz display. Normal-count phone
navigation survived across Single, Continuous, PI, Original Cannon, and Twin
Bloom, but fullscreen WebGPU effects stayed blank. Cannon menu previews did
render. A temporary TextureView-only comparison, including a cold start,
also left Continuous blank; it does not establish SurfaceView as the cause.
Skia produced visible particles on the same phone.

Twenty normal-count menu-to-Continuous-and-back cycles survived, but process
PSS grew from 676 MiB to 858 MiB after ten cycles and 999 MiB after twenty.
Ten seconds of background time reduced PSS to 922 MiB. A subsequent simulated
MODERATE memory-pressure trim reclaimed most of the growth, reducing PSS to
716 MiB. This is substantial reclaimable retention in the debug scenario,
not proof of a permanent particle leak. Blank rendering limits the result.

The phone's 30,000-particle menu stress test crashed on both cold-start
attempts. Both native SIGSEGV stacks point into React Native Fabric's
`MountingCoordinator::pullTransaction`, attempting to execute non-executable
heap memory. This is a confirmed runtime failure, not evidence that Dawn
caused it. On the older emulator backend, separate crashes reached Dawn
`BufferBase::MapAtCreation`; Cannon also caused an ANR in Vulkan fence waiting.
Newer emulator Vulkan backends also stalled. These are recorded separately
from physical-device results.

Blank rendering and stress crashes prevent a meaningful replacement for the
historical 120 Hz performance and GPU-memory benchmarks. The historical
`CreateComputePipelines failed` error was not observed in the tested runs;
this does not prove the old problem is fixed. Screenshots, logs, native crash
evidence, and the test matrix are under `.context/android-retest/`.

The iOS evidence remains a normal-count simulator rendering smoke check.
Android debug testing does not establish release performance or broad device
compatibility. All temporary pressure, logging, and surface-selection changes
were restored after the comparisons.

Screenshots: `.context/dependency-upgrade/skia-graphite-menu.png` and
`.context/dependency-upgrade/webgpu-menu.png`. The dedicated simulator is
`Confetti vientiane Graphite`; its demo uses Metro on port 8095. That simulator
was shut down during Android testing.

The earlier Expo 56 build backported Worklets #10113. The current workspace uses Expo 57, React Native 0.86.3, Reanimated 4.7.1 and Worklets 0.13.0 instead, with no Worklets patch. See [the Expo 57 upgrade report](EXPO_57_UPGRADE.md) for validation and the remaining WebGPU patch.
