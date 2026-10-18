# Release the cached canvas texture on unconfigure

This is an inactive record of a former local change to `react-native-webgpu`
`0.13.1`. The repository does not apply it during installation. These notes
live outside `src` and `lib` and are excluded from the published package.

`SurfaceInfo::unconfigure()` releases its drawing buffer, but the canvas context
can still hold the last `GPUTexture` wrapper until another acquisition or
context collection. The change resets that wrapper and its epoch under the
existing mutex. It releases the reference sooner on both native platforms.

This is a retention improvement, not a demonstrated rendering requirement.
On the physical Samsung SM-A736B, stock WebGPU completed 100 navigation cycles.
PSS was 416.01 MiB at cycle 100 and 245.32 MiB after settling in the background;
the earlier patched run measured 479.06 and 289.64 MiB respectively. The
single-run comparison shows no observed regression; it does not prove a memory
improvement or absence of retention. Stock WebGPU rendered 30,000 particles at
118.73 FPS versus 118.89 FPS in the earlier patched run.

Upstream: no PR from this project as of 2026-10-18. `react-native-webgpu` 0.16.1
does not include this change.

## Recorded diff

This change is independent of the two Apple fixes.

```diff
diff --git a/cpp/rnwgpu/api/GPUCanvasContext.cpp b/cpp/rnwgpu/api/GPUCanvasContext.cpp
--- a/cpp/rnwgpu/api/GPUCanvasContext.cpp
+++ b/cpp/rnwgpu/api/GPUCanvasContext.cpp
@@ -32,7 +32,15 @@
   _surfaceInfo->configure(surfaceConfiguration, std::move(viewFormats));
 }

-void GPUCanvasContext::unconfigure() { _surfaceInfo->unconfigure(); }
+void GPUCanvasContext::unconfigure() {
+  _surfaceInfo->unconfigure();
+  // Retiring the drawing buffer must also retire the wrapper cached by this
+  // context. Otherwise an unmounted JS context pins its last native image
+  // until both JS runtimes collect their wrappers.
+  std::lock_guard<std::mutex> lock(_currentTextureMutex);
+  _currentTexture.reset();
+  _currentTextureEpoch = 0;
+}

 std::shared_ptr<GPUTexture> GPUCanvasContext::getCurrentTexture() {
   if (!_surfaceInfo->isConfigured()) {
```
