# Apple surface transitions on the main thread

This is an inactive record of a former local change to `react-native-webgpu`
`0.13.1`. The repository does not apply it during installation. These notes
live outside `src` and `lib` and are excluded from the published package.

The change dispatches configuration, resize, recovery, and pending surface
attachment to the Apple main queue. It dispatches before taking the surface
mutex and removes the off-main `CATransaction` flush.

The current confetti renderer already configures, renders, and retires iOS
canvases on the UI/main runtime. The unpatched simulator passed 100 navigation
cycles; a further static, paused, and active probe recorded 96 configurations,
all on main. This does not establish behavior on every physical iOS device or
for other renderers that perform surface operations off main.

Upstream: [PR #459](https://github.com/wcandillon/react-native-webgpu/pull/459),
open when checked on 2026-10-12.

## Recorded diff

The base is the unmodified npm `0.13.1` source.

```diff
diff --git a/apple/MetalLayerColorSpace.mm b/apple/MetalLayerColorSpace.mm
--- a/apple/MetalLayerColorSpace.mm
+++ b/apple/MetalLayerColorSpace.mm
@@ -1,7 +1,6 @@
 #import <CoreGraphics/CoreGraphics.h>
 #import <Foundation/Foundation.h>
 #import <QuartzCore/CAMetalLayer.h>
-#import <QuartzCore/CATransaction.h>

 #include "webgpu/webgpu_cpp.h"

@@ -31,14 +30,6 @@
     // 8-bit format.
     metalLayer.colorspace = nil;
   }
-  // The change must be set synchronously so the first present already sees
-  // it, and it must reach the render server. On a non-main thread (RN JS or
-  // worklet runtime) the property lands in that thread's implicit
-  // CATransaction, which may never commit on threads without a spinning
-  // runloop, so flush it now. On the main thread the runloop commits it.
-  if (!NSThread.isMainThread) {
-    [CATransaction flush];
-  }
 }

 } // namespace rnwgpu
diff --git a/cpp/rnwgpu/RNWebGPUManager.cpp b/cpp/rnwgpu/RNWebGPUManager.cpp
--- a/cpp/rnwgpu/RNWebGPUManager.cpp
+++ b/cpp/rnwgpu/RNWebGPUManager.cpp
@@ -240,11 +240,19 @@

 void RNWebGPUManager::flushPendingSurfaceTransition(
     std::shared_ptr<SurfaceInfo> info) {
-  if (info == nullptr || _jsCallInvoker == nullptr) {
+  if (info == nullptr) {
+    return;
+  }
+#ifdef __APPLE__
+  RunOnMainThreadAsync(
+      [info = std::move(info)] { info->applyPendingAttach(); });
+#else
+  if (_jsCallInvoker == nullptr) {
     return;
   }
   _jsCallInvoker->invokeAsync(
       [info = std::move(info)] { info->applyPendingAttach(); });
+#endif
 }

 RNWebGPUManager::~RNWebGPUManager() {
diff --git a/cpp/rnwgpu/RNWebGPUManager.h b/cpp/rnwgpu/RNWebGPUManager.h
--- a/cpp/rnwgpu/RNWebGPUManager.h
+++ b/cpp/rnwgpu/RNWebGPUManager.h
@@ -36,10 +36,9 @@

   /**
    * Applies a surface attach latched by the platform UI thread (see
-   * SurfaceInfo::applyPendingAttach) from the JS thread. Surface attaches are
-   * normally adopted at the next frame boundary by whichever thread renders;
-   * this flush covers contexts that are not actively rendering (static
-   * content), so the last offscreen frame still makes it on screen.
+   * SurfaceInfo::applyPendingAttach). Apple runs the transition on main;
+   * other platforms use the JS CallInvoker. This covers contexts that are not
+   * actively rendering, so the last offscreen frame still reaches the screen.
    */
   void flushPendingSurfaceTransition(std::shared_ptr<SurfaceInfo> info);

diff --git a/cpp/rnwgpu/SurfaceRegistry.h b/cpp/rnwgpu/SurfaceRegistry.h
--- a/cpp/rnwgpu/SurfaceRegistry.h
+++ b/cpp/rnwgpu/SurfaceRegistry.h
@@ -1,6 +1,7 @@
 #pragma once

 #include <algorithm>
+#include <exception>
 #include <atomic>
 #include <cerrno>
 #include <chrono>
@@ -27,6 +28,8 @@
 #endif

 #ifdef __APPLE__
+#include <dispatch/dispatch.h>
+#include <pthread.h>
 namespace dawn::native::metal {
 void WaitForCommandsToBeScheduled(WGPUDevice device);
 } // namespace dawn::native::metal
@@ -35,6 +38,53 @@
 namespace rnwgpu {

 #ifdef __APPLE__
+namespace detail {
+inline void InvokeMainThreadFunction(void *context) {
+  (*static_cast<std::function<void()> *>(context))();
+}
+} // namespace detail
+
+// Surface transitions are rare and synchronous WebGPU calls must observe the
+// configured surface before they return. Dispatch before taking SurfaceInfo's
+// mutex so the main thread can never wait on a lock held by the caller.
+inline void RunOnMainThreadSync(std::function<void()> function) {
+  if (pthread_main_np() != 0) {
+    function();
+    return;
+  }
+
+  std::exception_ptr error;
+  std::function<void()> guarded = [&]() {
+    try {
+      function();
+    } catch (...) {
+      error = std::current_exception();
+    }
+  };
+  dispatch_sync_f(dispatch_get_main_queue(), &guarded,
+                  detail::InvokeMainThreadFunction);
+  if (error) {
+    std::rethrow_exception(error);
+  }
+}
+
+inline void RunOnMainThreadAsync(std::function<void()> function) {
+  if (!function) {
+    return;
+  }
+  if (pthread_main_np() != 0) {
+    function();
+    return;
+  }
+
+  auto *ownedFunction = new std::function<void()>(std::move(function));
+  dispatch_async_f(dispatch_get_main_queue(), ownedFunction, [](void *context) {
+    std::unique_ptr<std::function<void()>> function(
+        static_cast<std::function<void()> *>(context));
+    (*function)();
+  });
+}
+
 // Tags the CAMetalLayer with the colorspace matching the configured texture
 // format. Implemented in apple/MetalLayerColorSpace.mm.
 void applyCAMetalLayerColorSpace(void *nativeSurface,
@@ -130,13 +180,11 @@
 //   destruction alone (backgrounding, TextureView teardown) never removes an
 //   entry; it only detaches the surface.
 // - Attaching a surface is LATCHED: the UI thread stores it as pending
-//   (attachSurface) and it is adopted at the next frame boundary — start of
-//   getCurrentTexture or end of presentFrame — on whichever thread renders
-//   (main JS, Reanimated UI, or a worklet runtime). This preserves Dawn
-//   surface thread-affinity and guarantees a surface is never swapped in the
-//   middle of a frame. For contexts that are not actively rendering,
-//   RNWebGPUManager::flushPendingSurfaceTransition applies the attach from the
-//   JS thread instead.
+//   (attachSurface) and it is adopted at a frame boundary, never in the middle
+//   of a frame. Apple adopts and configures on the main thread because Dawn
+//   mutates CAMetalLayer there. Other platforms adopt on the rendering
+//   runtime. RNWebGPUManager::flushPendingSurfaceTransition also covers
+//   contexts that are not actively rendering.
 // - Detaching (switchToOffscreen) is IMMEDIATE, because the platform destroys
 //   the surface as soon as its callback returns. A configured context falls
 //   back to rendering into an offscreen texture, so a running render loop
@@ -236,6 +284,22 @@
   // block adoption. The flush path (other threads) leaves it false so it never
   // swaps the surface under a frame that is genuinely in flight.
   void applyPendingAttach(bool supersedeInFlightFrame = false) {
+#ifdef __APPLE__
+    if (pthread_main_np() == 0) {
+      {
+        std::unique_lock<std::shared_mutex> lock(_mutex);
+        if (supersedeInFlightFrame) {
+          _frameInFlight = false;
+          _acquiredFromSurface = false;
+        }
+        if (!_hasPendingAttach) {
+          return;
+        }
+      }
+      RunOnMainThreadSync([this]() { applyPendingAttach(); });
+      return;
+    }
+#endif
     bool presentBlit = false;
     uint64_t blitEpoch = 0;
     wgpu::Device device = nullptr;
@@ -317,6 +381,16 @@

   void configure(wgpu::SurfaceConfiguration &newConfig,
                  std::vector<wgpu::TextureFormat> viewFormats) {
+#ifdef __APPLE__
+    if (pthread_main_np() == 0) {
+      auto config = newConfig;
+      RunOnMainThreadSync(
+          [this, config, viewFormats = std::move(viewFormats)]() mutable {
+            configure(config, std::move(viewFormats));
+          });
+      return;
+    }
+#endif
     applyPendingAttach(/* supersedeInFlightFrame = */ true);
     std::unique_lock<std::shared_mutex> lock(_mutex);
     _viewFormats = std::move(viewFormats);
@@ -351,6 +425,13 @@

   // Resize the drawing buffer (canvas.width/height changed).
   void reconfigure(int newWidth, int newHeight) {
+#ifdef __APPLE__
+    if (pthread_main_np() == 0) {
+      RunOnMainThreadSync(
+          [this, newWidth, newHeight]() { reconfigure(newWidth, newHeight); });
+      return;
+    }
+#endif
     std::unique_lock<std::shared_mutex> lock(_mutex);
     if (_config.device == nullptr) {
       return;
@@ -363,6 +444,12 @@
   }

   void unconfigure() {
+#ifdef __APPLE__
+    if (pthread_main_np() == 0) {
+      RunOnMainThreadSync([this]() { unconfigure(); });
+      return;
+    }
+#endif
     std::unique_lock<std::shared_mutex> lock(_mutex);
     if (_surface) {
       _surface.Unconfigure();
@@ -484,32 +571,57 @@
       // not shown.
     }
 #endif
-    std::unique_lock<std::shared_mutex> lock(_mutex);
-    if (_config.device == nullptr) {
-      throw std::runtime_error(
-          "[WebGPU] getCurrentTexture() called on a canvas context that is "
-          "not configured; call context.configure() first");
-    }
-    _frameInFlight = true;
-    _acquiredFromSurface = false;
-    _frameEpoch++;
-    if (frameEpoch) {
-      *frameEpoch = _frameEpoch;
-    }
-    if (_surface) {
-      auto texture = acquireSurfaceTextureLocked();
-      if (texture) {
-        _acquiredFromSurface = true;
-        return texture;
-      }
-      // The surface is transiently unusable (e.g. mid-resize, lost while
-      // backgrounding): fall back to an offscreen texture so the render loop
-      // survives; this frame is simply not presented.
-    }
-    if (!_texture) {
-      _texture = createOffscreenTextureLocked();
-    }
-    return _texture;
+    for (int attempt = 0; attempt < 2; attempt++) {
+#ifdef __APPLE__
+      uint64_t recoveryEpoch = 0;
+#endif
+      {
+        std::unique_lock<std::shared_mutex> lock(_mutex);
+        if (_config.device == nullptr) {
+          throw std::runtime_error(
+              "[WebGPU] getCurrentTexture() called on a canvas context that "
+              "is not configured; call context.configure() first");
+        }
+        _frameInFlight = true;
+        _acquiredFromSurface = false;
+        _frameEpoch++;
+        if (frameEpoch) *frameEpoch = _frameEpoch;
+        if (_surface) {
+          auto acquired = acquireSurfaceTextureLocked();
+          if (acquired.texture) {
+            _acquiredFromSurface = true;
+            return acquired.texture;
+          }
+#ifdef __APPLE__
+          if (acquired.needsReconfigure && attempt == 0) {
+            // Release the surface lock before synchronously dispatching to
+            // main. The epoch prevents a concurrent frame or lifecycle change
+            // from being overwritten by the recovery configure.
+            _frameInFlight = false;
+            _frameEpoch++;
+            recoveryEpoch = _frameEpoch;
+          } else
+#endif
+          {
+            // The surface is transiently unusable: render offscreen and drop
+            // this frame so the render loop survives the lifecycle change.
+            if (!_texture) {
+              _texture = createOffscreenTextureLocked();
+            }
+            return _texture;
+          }
+        } else {
+          if (!_texture) {
+            _texture = createOffscreenTextureLocked();
+          }
+          return _texture;
+        }
+      }
+#ifdef __APPLE__
+      reconfigureAfterAcquireFailure(recoveryEpoch);
+#endif
+    }
+    throw std::runtime_error("[WebGPU] surface recovery failed");
   }

   // True while the frame started by the getCurrentTexture() call that
@@ -694,6 +806,21 @@
 #endif

 private:
+#ifdef __APPLE__
+  void reconfigureAfterAcquireFailure(uint64_t expectedEpoch) {
+    RunOnMainThreadSync([this, expectedEpoch]() {
+      std::unique_lock<std::shared_mutex> lock(_mutex);
+      if (!_surface || _config.device == nullptr || _frameInFlight ||
+          _frameEpoch != expectedEpoch) {
+        return;
+      }
+      _texture = nullptr;
+      _frameEpoch++;
+      _configureLocked();
+    });
+  }
+#endif
+
   void detach(bool createFallbackTexture) {
     void *releasedSurfaces[2] = {nullptr, nullptr};
     NativeSurfaceReleaser releasers[2];
@@ -791,26 +918,28 @@

   // Acquire the surface's current texture, reconfiguring once when the surface
   // reports it is stale (rotation, resize, coming back from background).
-  wgpu::Texture acquireSurfaceTextureLocked() {
+  struct SurfaceTextureAcquireResult {
+    wgpu::Texture texture = nullptr;
+    bool needsReconfigure = false;
+  };
+
+  SurfaceTextureAcquireResult acquireSurfaceTextureLocked() {
     wgpu::SurfaceTexture surfaceTexture;
     _surface.GetCurrentTexture(&surfaceTexture);
     if (!isAcquireSuccess(surfaceTexture)) {
-      if (surfaceTexture.status ==
-          wgpu::SurfaceGetCurrentTextureStatus::Error) {
-        return nullptr;
-      }
+      if (surfaceTexture.status == wgpu::SurfaceGetCurrentTextureStatus::Error) {
+        return {};
+      }
+#ifdef __APPLE__
+      return {.texture = nullptr, .needsReconfigure = true};
+#else
       configureSurfaceLocked(_config);
-      // DAWN_WORKAROUND_DEVICE_DESTROY_BEFORE_SURFACE_RELEASE: the reconfigure
-      // may have replaced the surface and failed to create a new one.
-      if (!_surface) {
-        return nullptr;
-      }
+      if (!_surface) return {};
       _surface.GetCurrentTexture(&surfaceTexture);
-      if (!isAcquireSuccess(surfaceTexture)) {
-        return nullptr;
-      }
-    }
-    return surfaceTexture.texture;
+      if (!isAcquireSuccess(surfaceTexture)) return {};
+#endif
+    }
+    return {.texture = surfaceTexture.texture, .needsReconfigure = false};
   }

   static bool isAcquireSuccess(const wgpu::SurfaceTexture &surfaceTexture) {
```
