# Android WebGPU rendering and navigation fixes

The current dependency stack is Expo 57 / RN 0.86.3 / Reanimated 4.7.1 / Worklets 0.13.0. Worklets is unpatched. The performance and memory results below were captured before this upgrade unless labeled otherwise. See [the upgrade report](EXPO_57_UPGRADE.md) for new-stack verification.

## Android execution architecture

Keep WebGPU. Android now uses one dedicated Worklets GPU runtime for frame callbacks, command encoding, queue submission, swapchain configuration and retirement. Reanimated supplies the vsync timestamp on the UI thread. A synchronizable pending flag coalesces timestamps so a slow GPU tick cannot build an unbounded queue of stale frames. Private renderer clocks and controls use synchronizable values, avoiding synchronous worker-to-UI reads in each frame. iOS retains its main-thread Metal presentation path.

Register frame callbacks directly from the RN runtime into the owning runtime. Routing captured helper functions through RN, UI and then the worker made them non-callable in release builds. The worker installs its dispatcher once; UI ticks capture only the timestamp and pending flag.

## Measured presentation

Samsung Galaxy A73 SM-A736B, Android 16, Adreno 642L, 1080 x 2400, 120 Hz. Release APK, pure profile route, TextureView, approximately 20 seconds per trace. Counts describe simulated particles, not all particles simultaneously on screen.

| Particles | Before worker | Dedicated worker |
| --------- | ------------: | ---------------: |
| 400       |     60.12 FPS |       118.97 FPS |
| 30,000    |     59.09 FPS |       116.33 FPS |
| 100,000   |     43.15 FPS |        87.13 FPS |

Perfetto joins app display-frame tokens to SurfaceFlinger display frames to count actual presentations. These rates do not establish perfect frame pacing: the traces still contain compositor stuffing/late-present classifications, and 100,000 particles exceed this phone's 120 Hz budget. Matching traces and machine-readable results live in `.context/android-fix/presentation-metrics.json` and the `release-*`/`final-*` trace files.

## Changes

- Keep spawn initialization and runtime-state initialization in separate compute passes. The phone accepted a single-pass pipeline switch without a validation error, but runtime readback remained zero while spawn readback was valid. With separate passes, runtime positions, velocities, quaternions and floor state initialized correctly, and falling effects rendered. The same sequence is used at creation and cycle restart.
- Default Android GPU effects to TextureView. SurfaceView remains an explicit `androidTransparencyMode="surface-overlay"` choice for a topmost overlay whose host controls navigation. TextureView lets the native screen apply movement, alpha and clipping to the effect.
- Keep demo effects mounted until native-stack transitionEnd, then retire hidden effects. Focus changes alone are too early to remove an outgoing effect. Web retains focus-based visibility.
- Upgrade react-native-screens from 4.25.2 to 4.29.0 in both demos. The initial 4.28.0 upgrade includes upstream #4413: a process-lifetime mounting listener, synchronized callback ownership, and safe invalidation. It removes the unsynchronized lazy shared_ptr initialization matching the Fabric crash at MountingCoordinator::pullTransaction +524.
- Add particle-count and surface query parameters to the existing profiling route for matched presentation comparisons.

## Evidence

The exact shipped Fabric crash was disassembled: the failing instruction was the indirect virtual call to shouldOverridePullTransaction. This matches upstream [screens #4413](https://github.com/software-mansion/react-native-screens/pull/4413), corroborated in [#4654](https://github.com/software-mansion/react-native-screens/issues/4654). It is a navigation-library race, not evidence of a GPU throughput ceiling.

Diagnostic clear-color rendering proved the WebGPU surface could present. Readback isolated the falling-effect failure to runtime initialization. Diagnostic probes and readbacks were removed from shipping source after the comparison.

A recording of paused Continuous particles shows them translating and fading with the outgoing screen and disappearing at transition completion. The final clean-build recording is `.context/android-fix/navigation-final.mp4`. Its paused particles shift horizontally and fade in frames 25 through 27, then disappear by frame 28. Intermediate frames and a particle-color alignment measurement are saved alongside it.

The physical Samsung SM-A736B passed 20 cold starts with the pressure-mode menu after the fixes, with no new native crash or ANR in the validation log. This is bounded verification, not proof across every Android driver.

## Profile route

Open `confetti://profile-webgpu?variant=pure&count=30000&surface=texture` or change the surface to `surface-overlay`. Count defaults to the normal demo count and is capped at 100,000. Keep viewport, flakes, count, physics and device constant when comparing surfaces. The count describes allocated/simulated particles; the number visible depends on spawn spacing, motion and time.

Native artifacts and validation results are under `.context/android-fix/`. Historical `.context/android-retest/` captures the pre-fix failures and should not be treated as the current result. No Git index changes, commit or push were made during this work.

## Resource lifetime and memory

Retirement now acknowledges a FIFO barrier on the frame runtime before releasing a resource lease. React's layout cleanup queues callback removal and canvas unconfiguration before passive resource cleanup. This covers callback replacement and mounts cancelled before their first frame registration, without relying on a promise tied to a particular callback incarnation.

Android reuses exclusively leased, idle particle buffers, bind groups and texture atlases. Recycling happens after that owner barrier. Reinitialization and writes use the same device queue as the retired submissions, so queue order protects reuse. Dawn defers physical destruction until submitted uses finish. Cancellation physically destroys its never-handed-off allocations. Each device retains at most 16 idle sets and 64 MiB of buffer/atlas storage; this budget does not describe total process or driver memory. Eviction, backgrounding and device loss destroy idle allocations. The background observer holds weak pool references, so it does not pin injected devices. Idle entries omit caller configuration and assets. Preset particle data is uploaded on each borrow and is not retained as a buffer's initial-data array.

The same phone's release menu/Continuous navigation test, after five warmup cycles:

| Checkpoint                    | Before reuse | Reuse and canvas release |
| ----------------------------- | -----------: | -----------------------: |
| Warm menu                     |   474.92 MiB |               458.95 MiB |
| 10 measured cycles            |   621.17 MiB |               521.07 MiB |
| 20 measured cycles            |   740.67 MiB |               537.37 MiB |
| 30 measured cycles            |   848.95 MiB |               561.69 MiB |
| 40 measured cycles            |   967.48 MiB |               548.03 MiB |
| 15 seconds idle in foreground |   947.50 MiB |               484.83 MiB |
| 15 seconds in background      |   871.57 MiB |               388.90 MiB |

These are total process PSS from `dumpsys meminfo`, including React Native, Skia, UI and the previews. At cycle 40, native-heap PSS fell from 710.20 MiB to 230.91 MiB. The post-fix samples stopped rising between cycles 30 and 40. This comparison preceded the final cancellation-path split, background eviction and FIFO-barrier cleanup refinements; final-run evidence is recorded separately in the workspace report.

Control experiments disabled effects, disabled frame encoding, collected one or both JavaScript runtimes, and verified pipeline reuse. A six-cycle control with effects disabled kept memory approximately flat; it does not establish long-run behavior. Merely keeping the menu mounted or moving initialization encoding to the worker did not fix retention. Reusing the retired allocations removed most of the repeated native allocation growth. No forced collection, private native release API, frame-rate hint or diagnostic allocator code remains in shipping source.

Native heapprofd failed with `CLIENT_ERROR_INVALID_STACK_BOUNDS` on this device. Its short partial traces cannot establish the exact internal driver allocation responsible for all retention. The interventions and repeated PSS measurements establish the practical resource-lifetime improvement.

## Native WebGPU patch

The checked-in 0.13.1 Bun patch retains the existing Apple transition fixes and adds two shared native changes:

- Unconfiguration clears `GPUCanvasContext`'s cached current-texture wrapper, releasing the context's reference to its retired drawing buffer.
- Uncaptured errors run against the device's owning `RuntimeContext`, matching the `CallInvoker` used to deliver them. Unboxing briefly changes the mutable native object's creation-runtime pointer before restoring it. Reading that pointer during concurrent error delivery can use the wrong Hermes runtime.

The error-delivery race was tested with fault injection: a diagnostic build widened the existing unboxing window to 500 ms and generated validation errors concurrently. The original delivery crashed in Hermes/Worklets on the JS thread. With the owning-context change, the same diagnostic build delivered 48 validation errors and remained alive. Normal error delivery also passed before the change. This proves the widened race and its fix, while not establishing that every earlier unexplained crash had this cause. All injected errors and delays were removed afterwards.

Applications consuming the library must apply the WebGPU patch until these native fixes ship upstream. It is applied automatically in this Bun workspace, not embedded in a published JavaScript library.

## Final dependency refresh and pacing

The final refresh uses Skia 3.4.0, WebGPU 0.13.1 and screens 4.29.0. Screens 4.29.0 retains the 4.28.0 mounting-listener fix and adds [Android fragment/instance teardown fixes](https://github.com/software-mansion/react-native-screens/releases/tag/4.29.0).

A final clean release trace at 30,000 simulated particles presented 2,366 app frames over 19.994 seconds: 118.34 FPS. Thermal status was 0 before and after. App frame tokens were joined to SurfaceFlinger display frames to measure presentation, rather than counting worklet callbacks. Presentation intervals had a median of 8.311 ms, p95 of 8.366 ms and maximum of 33.268 ms; 37 intervals exceeded 12.5 ms. App-frame start to display presentation was 23.585 ms at the median and 32.348 ms at p95. These are pipeline timings, not input-to-photon latency. The average rate is near 120 Hz, with occasional longer intervals and queued presentation latency still measurable.

## Final release validation

The final release completed 100 measured menu/Continuous navigation cycles after five warmups, without a process restart. Total process PSS was 461.40 MiB after warmup, 568.00 MiB at cycle 40 and 619.30 MiB at cycle 100. It fell to 531.54 MiB after 15 seconds idle in the foreground and 444.26 MiB after 15 seconds in the background. Native-heap PSS rose from 212.53 MiB after warmup to 270.45 MiB at cycle 100 and remained 261.02 MiB after backgrounding. Reuse substantially improves retention, but this run does not establish a stable long-term memory ceiling. The native-heap drift in that intermediate build remained unresolved. See the subsequent stress runs below. Evidence: `.context/android-fix/shipping-memory-results.json` and `shipping-memory-breakdown.json`.

All five tested effect routes (Single, Continuous, PI, Original Cannon and Twin Bloom) rendered with Default, Money and Snow textures. In all 15 combinations, paused screenshots matched, resuming changed the rendered content and reset cleared the effect. PI Money/Snow were rechecked with an early pause to avoid sampling after the burst had completed. Evidence: `final-mode-controls-verified.json`, the corresponding screenshots and `pi-control-recheck.json`.

The unit suite passes 19 suites and 112 tests. Library type checking, library compilation, both demo type checks, focused lint and Android release/iOS simulator native builds pass. The iOS simulator also renders Continuous after the dependency refresh. This verifies builds and rendering on that simulator, not iOS hardware performance.

## Extended-run failure under investigation

After the completed 100-cycle run and final navigation recording, an attempted 200-cycle continuation crashed before its first 25-cycle checkpoint. Android records PID 7389 exiting with a native SIGSEGV at 04:19:13 on October 12. The stack runs through Hermes and React Native's `performMicrotaskCheckpoint` on the Android main thread. This supersedes any interpretation that the 100-cycle pass proves stability. The continuation did not complete and cannot establish a memory plateau. Evidence: `.context/android-fix/extended-current-crash.txt`, `extended-memory.log`.

## Earlier Worklets serialization race backport

Worklets 0.11.4 contains an unsynchronized `RetainingSerializable` secondary-runtime cache. Two runtimes can concurrently initialize it, overwrite its stored JavaScript value and publish a mismatched runtime pointer. The earlier Expo 56 build applied the exact upstream [#10113 fix](https://github.com/software-mansion/react-native-reanimated/pull/10113): a mutex protects initial publication and an atomic runtime pointer provides acquire/release ordering. This fix shipped in [Worklets 0.12.0](https://swmansion.com/changelog/worklets-0-12-0/). It removes a real cache race. The subsequent teardown comparison shows that this backport alone does not prevent the reproducible RN-thread crash; do not attribute that crash solely to the serialization cache.

An attempted Reanimated 4.6.0 / Worklets 0.12.2 upgrade hit Expo 56's native `executeSync` API incompatibility. That test retained Reanimated 4.5.3 / Worklets 0.11.4 with the backport. The current workspace instead uses Expo 57, React Native 0.86.3, Reanimated 4.7.1 and unpatched Worklets 0.13.0. The backport file and its Bun entry have been removed; current validation is recorded in [the Expo 57 upgrade report](EXPO_57_UPGRADE.md).

Upstream also documents a [Hermes V1 legacy-eval memory regression](https://github.com/software-mansion/react-native-reanimated/issues/9650). This is relevant to the installed React Native 0.85.3 / Hermes 250829098.0.10 stack, but our residual native-heap drift has not been attributed to it. The renderer does not ship forced garbage collection or an experimental Hermes override.

## Queue-ordered retirement comparison

The retirement path no longer calls `queue.onSubmittedWorkDone()` for every retired canvas. The CPU owner must stop submitting before a lease can be reused, but reuse on the same device queue follows the old submissions without a CPU completion wait. Destroyed buffers/textures also retain their submitted uses through the backend's deferred release. The [WebGPU resource-lifetime contract](https://gpuweb.github.io/gpuweb/#buffer-destruction) and [Dawn Vulkan fenced deletion](https://dawn.googlesource.com/dawn/+/41e4d9a34c1d9dcb2eef3ff39ff9c1f987bfa02a/src/dawn/native/vulkan/BufferVk.cpp) support this distinction. No mapped CPU readback is involved in the retired sets.

A diagnostic RN-thread encoder variant presented 30,000 simulated particles at 116.58 FPS under thermal status 3. With per-canvas completion promises, it crashed twice in Hermes/React Native's microtask checkpoint during early navigation: once before the first 10-cycle checkpoint and once during the five warmups. The otherwise identical variant without that promise completed 40 measured cycles. Its PSS ended at 517.02 MiB, then 453.98 MiB idle and 357.35 MiB in the background. Evidence: `rn-owner-crash.log`, `rn-fence-repeat-crash.log`, `rn-no-fence-memory-results.json`. This isolates the promise-wait boundary as a contributor in that variant; it does not identify the exact faulty native instruction or prove every historical crash shares that cause.

The retained encoder remains on the dedicated GPU worker to stay independent of RN JS work. Its earlier Worklets-backported build completed 300 cycles with background/resume and no process restart: 631.98 MiB at cycle 300, 563.42 MiB idle and 466.64 MiB backgrounded. Native-heap PSS at those final checkpoints was 285.08, 277.81 and 273.93 MiB, versus 223.46 MiB after warmup. Growth slowed substantially; the run does not prove zero retention. Evidence: `backport-memory-results.json` and `backport-memory-breakdown.json`. The final queue-ordered worker run is recorded separately.

## Final queue-ordered worker stress result

The final retained worker completed 100 measured cycles after five warmups, with a background/resume intermission at cycle 50 and no process restart. Total PSS was 461.21 MiB after warmup, 624.59 MiB at cycle 50, 458.42 MiB during the intermission, 608.79 MiB at cycle 75 and 643.17 MiB at cycle 100. It settled to 563.74 MiB after 15 seconds idle and 450.62 MiB after 15 seconds in the background. Native-heap PSS was 278.55 MiB at cycle 100, 271.41 MiB idle and 265.58 MiB backgrounded. This verifies the current cleanup with backgrounding; it does not establish zero native retention or a universal long-run ceiling. Evidence: worker-queue-memory-results.json, worker-queue-memory-breakdown.json and worker-queue-memory.log.

The current cleanup tests pass 19 suites / 112 tests. Type checking, compilation and focused lint pass. Both native builds passed with the native patches. After the final JS cleanup change, the iOS simulator completed 10 menu/Continuous URI cycles and still rendered Continuous. No iOS hardware performance was measured.

## Final rendering, navigation and pacing

The final APK passed all 15 mode/texture combinations with pause/resume/reset screenshot checks. PI Money/Snow passed the early-pause recheck. The process remained PID 20607 through the final 100-cycle stress run, the full texture matrix and the navigation recording. Evidence: `queue-final-controls-verified.json`, `queue-pi-control-recheck.json`, and `queue-navigation-final.mp4`.

Paused particle alignment in the final navigation recording shifts horizontally by 4, 30 and 38 pixels in frames 31, 32 and 33, relative to frame 30. Intensity falls to approximately 96%, 51% and 33%, then the outgoing full-screen effect disappears by frame 34. Color correlation remains above 0.90 at the aligned positions. The particles follow the outgoing screen's transform and fade; incoming menu previews then animate in their own cards. Evidence: `queue-navigation-particle-measurement.json` and `queue-nav-030.png` through `queue-nav-034.png`.

A fresh final-build 30,000-particle profile presented 2,319 app frames at 116.04 FPS. Thermal status was 1 at both ends, matching the mild-thermal status of the original before/after comparison (59.09 / 116.33 FPS). Intervals: median 8.311 ms, p95 8.407 ms, maximum 25.005 ms; 85 intervals exceeded 12.5 ms. App-frame start to presentation was 23.740 ms at the median and 32.292 ms at p95. These remain pipeline timings, not input-to-photon measurements. Evidence: `worker-queue-final-presentation-metrics.json` and `worker-queue-final-30000-texture.pftrace`.

The remaining limits are intermittent longer presentation intervals, thermal sensitivity, the 100,000-particle workload exceeding this phone's 120 Hz budget, and residual native-heap retention. The final backgrounded native heap was 265.58 MiB versus 206.32 MiB after warmup. The current cleanup avoids the demonstrated per-canvas completion-promise failure path, but the exact underlying Hermes/native fault inside that API is not symbolicated here. Those measurements used the older Expo 56 stack and its documented native patches. The current Expo 57 stack only retains the WebGPU patch. No direct-native Vulkan/GLES renderer was implemented or benchmarked.
