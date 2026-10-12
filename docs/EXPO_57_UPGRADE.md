# Expo 57 and unpatched Worklets

This branch supersedes dependency-upgrade PR #41 with the existing WebGPU renderer and the Android worker fixes. It preserves that PR's Oxc tooling migration. It does not add the experimental imperative Graphite renderer, which had no demonstrated performance advantage in that PR's tests.

## Dependency stack

| Dependency        | Version |
| ----------------- | ------- |
| Expo              | 57.0.27 |
| React Native      | 0.86.3  |
| React / React DOM | 19.2.3  |
| Reanimated        | 4.7.1   |
| Worklets          | 0.13.0  |
| Skia              | 3.4.0   |
| WebGPU            | 0.13.1  |
| Screens           | 4.29.0  |
| Safe Area Context | 5.10.1  |

Both demos exercise the local library with native builds. This intentionally replaces PR #41's published-package Expo Go example: Expo Go cannot exercise this branch's Skia v3 / WebGPU implementation or its newer Worklets runtime. Kitchen-sink also supports web export.

The library declares RN `>=0.86 <0.89`, Reanimated `>=4.7.1 <5`, and Worklets `>=0.13 <1`, matching the installed runtime compatibility tables. Expo's install exclusions preserve that newer Reanimated/Worklets pair and the newer Screens/Safe Area versions. TypeScript remains `npm:tsover@6.0.2` for TypeGPU's operator typing, so Expo's TypeScript version check is excluded as well. These exclusions do not replace native build checks.

## Patches

The Worklets 0.11.4 patch and its Bun registration are removed. Worklets contains the serialization race fix upstream, beginning with [0.12.0](https://swmansion.com/changelog/worklets-0-12-0/). The Expo 56 / Worklets 0.12 native `executeSync` mismatch is avoided by upgrading Expo and RN together.

The WebGPU 0.13.1 patch remains: Apple surface transition fixes, clearing the cached drawing-buffer wrapper on unconfigure, and delivering uncaptured errors against the owning RuntimeContext. It is applied in this workspace by Bun. A published JavaScript package does not apply it to the consumer's peer dependency. This upgrade removes the Worklets patch requirement; it does not establish an entirely patch-free WebGPU release.

## Validation

The unit suite passes 19 suites / 112 tests. Root, kitchen-sink and example typechecks pass. Both apps pass all 21 Expo Doctor checks after removing stale native modules left by the earlier workspace install. Kitchen-sink web export and example iOS/Android exports pass.

Android arm64 Release and iOS simulator Release builds pass. SDK 57 changed Android MenuView to wrap its trigger in a Pressable; the demo now renders a plain View inside it so taps reach the menu owner. The unit suite does not establish this interaction; device checks cover it.

The Samsung A73 (Android 16, 120 Hz) presented 30,000 simulated particles at 118.89 FPS in a 20-second Perfetto trace with thermal status 0 before and after. Presentation intervals: p50 8.311 ms, p95 8.362 ms, max 25.088 ms; 27 intervals exceeded 12.5 ms. This is bounded evidence, not a perfect-120-Hz claim. The source trace joins app frame tokens to SurfaceFlinger presentation timestamps. Only the demo menu trigger changed after that trace; the renderer is unchanged.

Earlier Android performance and memory measurements in `ANDROID_RENDERER_FIX.md` used Expo 56 and must not be presented as measurements of this upgraded stack. The iOS simulator completed 10 menu/Continuous URI cycles in one process and still rendered WebGPU confetti. This verifies simulator rendering and lifecycle only; iOS hardware performance was not measured. All five Android effect routes (Single, Continuous, PI, Original Cannon and Twin Bloom) passed Default/Money/Snow texture selection and restart/pause/resume/reset in one process: 15 combinations. Pixel comparisons of the saved frames confirm identical paused frames, visible changes after resume, and clearing after reset for every case. The final build completed 100 verified menu/Continuous navigation cycles after five warmups, with no process restart. It also passed a midrun background/resume and a final background/resume. Total PSS was 335.52 MiB after warmup, 443.66 at cycle 25, 461.04 at 50, 441.13 at 75 and 479.06 at 100; it settled to 388.10 MiB in the foreground and 289.64 MiB in the background. The lower footprint than the older Expo 56 run does not isolate a single dependency as its cause or establish zero retention. Native heap was 66.26 MiB after warmup and 94.64 MiB after the final background checkpoint.

A paused Continuous recording confirms the TextureView moves and fades with the outgoing screen, then retires when the menu returns. Navigation, screenshots, the Perfetto trace, control comparisons and raw memory snapshots are saved in `.context/expo57-upgrade/`. No new native crash or JavaScript exception appeared in the captured validation log. The test scope is one Adreno phone and an iOS simulator; this is not proof across every Android GPU.
