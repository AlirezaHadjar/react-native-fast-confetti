# Deliver device errors through the owning runtime

This is an inactive record of a former local change to `react-native-webgpu`
`0.13.1`. The repository does not apply it during installation. These notes
live outside `src` and `lib` and are excluded from the published package.

Unboxing temporarily changes a native object's creation-runtime pointer.
An asynchronous GPU error callback can race that window. The change uses the
stable owning `RuntimeContext` when creating error events and calling listeners.
It affects native devices shared across runtimes on Android and iOS.

This remains a conditional correctness issue: the upstream callback returns
before reading the runtime when there are no `uncapturederror` listeners.
Neither the default confetti renderer nor TypeGPU installs those listeners.
An injected app-owned device can have them, so default-renderer validation
does not establish safety for every shared-device integration.

An earlier diagnostic widened the unboxing window to 500 ms and injected
validation errors. The original code crashed; the fix delivered 48 errors
without that crash. The fault injection establishes the race and its fix,
not the natural failure rate on the current stack.

Upstream: no PR from this project as of 2026-10-18. `react-native-webgpu` 0.16.1
does not include this change.

## Recorded diff

This change is independent of the other three fixes.

```diff
diff --git a/cpp/rnwgpu/api/GPUDevice.cpp b/cpp/rnwgpu/api/GPUDevice.cpp
--- a/cpp/rnwgpu/api/GPUDevice.cpp
+++ b/cpp/rnwgpu/api/GPUDevice.cpp
@@ -694,10 +694,10 @@
     return;
   }

-  auto runtime = getCreationRuntime();
-  if (runtime == nullptr) {
-    return;
-  }
+  // The device's event callbacks belong to its original RuntimeContext.
+  // Unboxing temporarily changes NativeObject's runtime pointer before
+  // restoring it. Error delivery can race that window; the context is stable.
+  auto runtime = &_async->runtime();

   // Create the appropriate error object based on type
   GPUErrorVariant error;
```
