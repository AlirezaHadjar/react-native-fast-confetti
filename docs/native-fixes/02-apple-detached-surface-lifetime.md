# Retain detached Apple surfaces through frame submission

This is an inactive record of a former local change to `react-native-webgpu`
`0.13.1`. The repository does not apply it during installation. These notes
live outside `src` and `lib` and are excluded from the published package.

A native detach can destroy the surface after `getCurrentTexture()` but before
`queue.submit()`. The change retains the detached Dawn surface and native window
until `present()` or another frame boundary releases them. The surface retention
condition applies to Apple; Android does not retain the detached surface.

The current iOS renderer acquires, submits, and presents synchronously on main.
In the unpatched simulator probe, all 45 detaches had `inFlight=0` and
`acquired=0`. No requirement for this fix was demonstrated in that workload.
Concurrent render/teardown paths can still need it. Physical iOS was not retested.

Upstream: [PR #459](https://github.com/wcandillon/react-native-webgpu/pull/459),
open when checked on 2026-10-12.

## Recorded diff

This diff follows [the main-thread change](01-apple-surface-main-thread.md).
The two Apple fixes shared a file in the original patch. Recording them in
this order preserves the full original change without duplicating its hunks.

```diff
diff --git a/cpp/rnwgpu/SurfaceRegistry.h b/cpp/rnwgpu/SurfaceRegistry.h
--- a/cpp/rnwgpu/SurfaceRegistry.h
+++ b/cpp/rnwgpu/SurfaceRegistry.h
@@ -185,14 +185,15 @@
 //   mutates CAMetalLayer there. Other platforms adopt on the rendering
 //   runtime. RNWebGPUManager::flushPendingSurfaceTransition also covers
 //   contexts that are not actively rendering.
-// - Detaching (switchToOffscreen) is IMMEDIATE, because the platform destroys
-//   the surface as soon as its callback returns. A configured context falls
-//   back to rendering into an offscreen texture, so a running render loop
-//   keeps working; the in-flight frame, if any, is dropped at present(). When
-//   a new surface attaches, the latest offscreen frame is blitted onto it so
-//   content appears without waiting for the next render — the same mechanism
-//   that gives a fast time-to-first-frame when rendering starts before the
-//   native surface exists.
+// - Detaching (switchToOffscreen) is IMMEDIATE from the context's perspective.
+//   A configured context falls back to an offscreen texture, so a running
+//   render loop keeps working. If a frame already owns a surface texture, the
+//   old surface and native window stay retained until present() or the next
+//   frame boundary; destroying the swapchain earlier invalidates the texture
+//   before queue.submit(). When a new surface attaches, the latest offscreen
+//   frame is blitted onto it so content appears without waiting for the next
+//   render — the same mechanism that gives a fast time-to-first-frame when
+//   rendering starts before the native surface exists.
 class SurfaceInfo {
 public:
   SurfaceInfo(wgpu::Instance gpu, int width, int height)
@@ -216,12 +217,16 @@
     _surfaceDevice = nullptr;
 #endif
     _pendingSurface = nullptr;
+    _retiredSurface = nullptr;
     _texture = nullptr;
     if (_pendingReleaser && _pendingNativeSurface) {
       _pendingReleaser(_pendingNativeSurface);
     }
     if (_releaser && _nativeSurface) {
       _releaser(_nativeSurface);
+    }
+    if (_retiredReleaser && _retiredNativeSurface) {
+      _retiredReleaser(_retiredNativeSurface);
     }
   }

@@ -381,6 +386,7 @@

   void configure(wgpu::SurfaceConfiguration &newConfig,
                  std::vector<wgpu::TextureFormat> viewFormats) {
+    releaseRetiredSurface();
 #ifdef __APPLE__
     if (pthread_main_np() == 0) {
       auto config = newConfig;
@@ -444,6 +450,7 @@
   }

   void unconfigure() {
+    releaseRetiredSurface();
 #ifdef __APPLE__
     if (pthread_main_np() == 0) {
       RunOnMainThreadSync([this]() { unconfigure(); });
@@ -528,7 +535,8 @@
       return true;
     }
 #endif
-    return _nativeSurface != nullptr || _hasPendingAttach;
+    return _nativeSurface != nullptr || _hasPendingAttach ||
+           _retiredNativeSurface != nullptr;
   }

   // Returns the texture for the current frame: the surface's swapchain texture
@@ -539,6 +547,7 @@
   wgpu::Texture getCurrentTexture(uint64_t *frameEpoch = nullptr) {
     // Start-of-frame boundary; a new acquire supersedes any previous frame
     // that never presented.
+    releaseRetiredSurface();
     applyPendingAttach(/* supersedeInFlightFrame = */ true);
 #if defined(__ANDROID__)
     if (_poolMode.load()) {
@@ -661,6 +670,8 @@
       dawn::native::metal::WaitForCommandsToBeScheduled(device.Get());
     }
 #endif
+    void *retiredNativeSurface = nullptr;
+    NativeSurfaceReleaser retiredReleaser;
     {
       std::unique_lock<std::shared_mutex> lock(_mutex);
       if (_surface && _acquiredFromSurface) {
@@ -669,6 +680,10 @@
       _acquiredFromSurface = false;
       _frameInFlight = false;
       _frameEpoch++;
+      takeRetiredSurfaceLocked(retiredNativeSurface, retiredReleaser);
+    }
+    if (retiredReleaser && retiredNativeSurface) {
+      retiredReleaser(retiredNativeSurface);
     }
     applyPendingAttach();
   }
@@ -821,9 +836,33 @@
   }
 #endif

+  // A native detach can race the synchronous JS frame sequence between
+  // getCurrentTexture() and queue.submit(). Keep that frame's Dawn surface and
+  // native window alive until submit has completed and present() reaches the
+  // next frame boundary. A second acquire also supersedes and releases it.
+  void releaseRetiredSurface() {
+    void *retiredNativeSurface = nullptr;
+    NativeSurfaceReleaser retiredReleaser;
+    {
+      std::unique_lock<std::shared_mutex> lock(_mutex);
+      takeRetiredSurfaceLocked(retiredNativeSurface, retiredReleaser);
+    }
+    if (retiredReleaser && retiredNativeSurface) {
+      retiredReleaser(retiredNativeSurface);
+    }
+  }
+
+  void takeRetiredSurfaceLocked(void *&nativeSurface,
+                                NativeSurfaceReleaser &releaser) {
+    _retiredSurface = nullptr;
+    nativeSurface = _retiredNativeSurface;
+    releaser = std::move(_retiredReleaser);
+    _retiredNativeSurface = nullptr;
+  }
+
   void detach(bool createFallbackTexture) {
-    void *releasedSurfaces[2] = {nullptr, nullptr};
-    NativeSurfaceReleaser releasers[2];
+    void *releasedSurfaces[3] = {nullptr, nullptr, nullptr};
+    NativeSurfaceReleaser releasers[3];
 #if defined(__ANDROID__)
     // Destroyed outside the lock: it releases a JNI reference.
     std::function<void()> releasedFrameReady;
@@ -869,11 +908,23 @@
         releasers[0] = std::move(_pendingReleaser);
         _pendingNativeSurface = nullptr;
       }
+      takeRetiredSurfaceLocked(releasedSurfaces[1], releasers[1]);
       if (_surface) {
         if (createFallbackTexture && _config.device != nullptr) {
           _texture = createOffscreenTextureLocked();
         }
-        _surface = nullptr;
+#ifdef __APPLE__
+        if (_frameInFlight && _acquiredFromSurface) {
+          _retiredSurface = std::move(_surface);
+          _retiredNativeSurface = _nativeSurface;
+          _retiredReleaser = std::move(_releaser);
+        } else
+#endif
+        {
+          _surface = nullptr;
+          releasedSurfaces[2] = _nativeSurface;
+          releasers[2] = std::move(_releaser);
+        }
 #if defined(__ANDROID__)
         // DAWN_WORKAROUND_DEVICE_DESTROY_BEFORE_SURFACE_RELEASE
         _surfaceDevice = nullptr;
@@ -885,12 +936,14 @@
       _frameEpoch++;
       // Window ownership is independent of the Dawn surface handle (which can
       // be null if surface creation failed): always return the window.
-      releasedSurfaces[1] = _nativeSurface;
-      releasers[1] = std::move(_releaser);
+      if (_nativeSurface && !_retiredNativeSurface && !releasedSurfaces[2]) {
+        releasedSurfaces[2] = _nativeSurface;
+        releasers[2] = std::move(_releaser);
+      }
       _nativeSurface = nullptr;
     }
     // Release outside the lock: the platform may do real work here.
-    for (int i = 0; i < 2; i++) {
+    for (int i = 0; i < 3; i++) {
       if (releasers[i] && releasedSurfaces[i]) {
         releasers[i](releasedSurfaces[i]);
       }
@@ -1330,6 +1383,11 @@
   void *_nativeSurface = nullptr;
   wgpu::Surface _surface = nullptr;
   NativeSurfaceReleaser _releaser;
+  // A detached surface retained until the frame that acquired from it has
+  // submitted, or until a new frame supersedes that unfinished frame.
+  void *_retiredNativeSurface = nullptr;
+  wgpu::Surface _retiredSurface = nullptr;
+  NativeSurfaceReleaser _retiredReleaser;
   // Offscreen fallback drawing buffer.
   wgpu::Texture _texture = nullptr;
   // Surface attached by the UI thread, awaiting adoption at a frame boundary.
```
