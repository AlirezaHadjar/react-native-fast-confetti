# Setup and Library Templates

---

## Installing a JSI Binding in React Native

A JSI binding must be installed into the `Runtime` **synchronously** during module initialization — before any JS runs. The installation point differs by platform.

### Android — `JSIModulePackage`

Override `getJSIModulePackage` in your `ReactApplication` (or use a `TurboReactPackage`):

```java
// MainApplication.java / MainApplication.kt
@Override
protected ReactNativeHost createReactNativeHost() {
  return new DefaultReactNativeHost(this) {
    @Override
    public boolean isNewArchEnabled() { return BuildConfig.IS_NEW_ARCHITECTURE_ENABLED; }
  };
}
```

On the C++ side, implement `JSIModuleProvider`:

```cpp
// MyJSIModule.cpp
void install(jsi::Runtime& rt) {
  rt.global().setProperty(
      rt, "myNativeModule",
      jsi::Object::createFromHostObject(rt, std::make_shared<MyHostObject>()));
}
```

For JNI glue between Java/Kotlin and your C++, use **FBJNI** — Meta's JNI helper library that's already a dependency of React Native:

```cpp
#include <fbjni/fbjni.h>

struct MyModule : public facebook::jni::JavaClass<MyModule> {
  static constexpr auto kJavaDescriptor = "Lcom/example/MyModule;";

  static void install(jsi::Runtime& rt) {
    // ...
  }
};
```

FBJNI handles JNI reference management, exception translation, and type-safe method lookup — prefer it over raw JNI.

### iOS — ObjC++ (`.mm`)

`.mm` is the Objective-C++ file extension. Rename any `.m` file to `.mm` and the compiler enables full C++ support in that translation unit — no imports, no flags, just the extension. This is necessary because React Native's iOS layer is Objective-C, your JSI code is C++, and you need a single file that speaks both. Pure `.m` files cannot include C++ headers like `<jsi/jsi.h>`.

Install from your native module's `setBridge:` lifecycle hook — React Native calls this on every registered module during initialization, before the JavaScript bundle is evaluated:

```objc
// MyModule.h
#import <React/RCTBridgeModule.h>

@interface MyModule : NSObject <RCTBridgeModule>
@end
```

```objc
// MyModule.mm  (must be .mm for ObjC++ to mix with C++)
#import "MyModule.h"
#import <React/RCTBridge+Private.h>
#import <jsi/jsi.h>
#import "install.h"  // your shared C++ header

using namespace facebook;

@implementation MyModule

@synthesize bridge = _bridge;

RCT_EXPORT_MODULE()

+ (BOOL)requiresMainQueueSetup {
    return YES;
}

// React Native calls setBridge: on every module during initialization.
// In Bridge mode, `bridge` is the real RCTCxxBridge.
// In Bridgeless mode (RN 0.76+), `bridge` is an RCTBridgeProxy that
// also exposes a `runtime` property via the interop layer.
- (void)setBridge:(RCTBridge *)bridge {
    _bridge = bridge;

    // respondsToSelector: guard — works for both RCTCxxBridge and
    // RCTBridgeProxy. The C-style cast below is a compiler hint only;
    // ObjC message dispatch (objc_msgSend) always uses the object's
    // actual class, so .runtime calls the right implementation.
    if (![bridge respondsToSelector:@selector(runtime)]) return;

    RCTCxxBridge *cxxBridge = (RCTCxxBridge *)bridge;

    // cxxBridge.runtime is typed void* in the ObjC header because ObjC
    // headers cannot include C++ types. Cast it to jsi::Runtime*.
    jsi::Runtime *runtime = (jsi::Runtime *)cxxBridge.runtime;
    if (runtime == nullptr) return;

    install(*runtime);
}

@end
```

Key points:
- `RCTCxxBridge` is React Native's internal bridge class that holds the `jsi::Runtime*`. It is not a public stable API, but has been consistent across RN 0.68+.
- `setBridge:` runs before the JS bundle is evaluated, guaranteeing the globals are registered before JS calls them.
- `requiresMainQueueSetup = YES` ensures initialization runs on the main queue, required if `install()` touches any UIKit state.
- The `respondsToSelector:` guard makes the same `.mm` file work in both Bridge mode and Bridgeless mode (RN 0.76+).

### iOS — Podspec

The `.podspec` file is the iOS equivalent of `CMakeLists.txt` — it tells CocoaPods which source files to compile and what headers and flags to set. It lives at the library root:

```ruby
# MyModule.podspec
require 'json'
package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name         = package['name']
  s.version      = package['version']
  s.summary      = package['description']
  s.homepage     = package['homepage']
  s.license      = package['license']
  s.author       = package['author']
  s.source       = { :git => package['repository']['url'], :tag => s.version }

  s.ios.deployment_target = '15.1'

  # Include both the ObjC++ wiring and the shared C++ core
  s.source_files = [
    'ios/**/*.{h,m,mm}',
    'cpp/**/*.{h,cpp}',
  ]

  s.pod_target_xcconfig = {
    # Lets #include "install.h" resolve when compiling the cpp/ files
    'HEADER_SEARCH_PATHS' => '"$(PODS_TARGET_SRCROOT)/cpp"',
    'CLANG_CXX_LANGUAGE_STANDARD' => 'c++17',
  }

  s.dependency 'React-Core'   # RCTBridge, RCTBridgeModule
  s.dependency 'React-jsi'    # jsi/jsi.h — JSI runtime headers
end
```

Critical lines:

| Line | Purpose |
|------|---------|
| `s.source_files` | Tells Xcode which files to compile. Paths are relative to the podspec location (library root). Include both `ios/*.mm` and `cpp/*.cpp`. |
| `HEADER_SEARCH_PATHS` | Lets `#include "install.h"` find your shared C++ headers. `PODS_TARGET_SRCROOT` resolves to the library root. |
| `CLANG_CXX_LANGUAGE_STANDARD` | Enables C++17 features (`std::optional`, structured bindings) needed by most JSI code. |
| `React-jsi` dependency | Provides `<jsi/jsi.h>` and the `jsi::Runtime` type. Without it the `.mm` file won't find the JSI headers. |

After adding the podspec, consumers run `cd ios && pod install` and Xcode picks up everything automatically.

---

## Android Platform Wiring — JNI, CMake, and FBJNI

Android's wiring is more layered than iOS. Java/Kotlin and C++ live in separate worlds connected by JNI — a standard Java mechanism (not React Native-specific) for calling C/C++ from Java.

### JNI Basics

**`System.loadLibrary()`** loads the compiled C++ shared library (`.so` file) that CMake produces. Call it in a `companion object { init { } }` block so it runs once when the class is loaded:

```kotlin
companion object {
    init {
        System.loadLibrary("mymodule")  // loads libmymodule.so
    }
}
```

The string `"mymodule"` matches the target name in `add_library(mymodule ...)` in `CMakeLists.txt`.

**Local vs global JNI references.** JNI distinguishes two reference types:
- **Local references** are valid only within the current JNI call frame (the duration of one `JNIEnv*` call). They are automatically freed when the native method returns.
- **Global references** (`env->NewGlobalRef(obj)`) survive across calls and must be manually released with `env->DeleteGlobalRef(ref)`. Forgetting to delete a global ref leaks the Java object and prevents GC.

For JSI install code (which runs once and returns), local references are sufficient. Only reach for global refs if you need to hold a Java object in a C++ struct across multiple calls.

**Passing the runtime pointer.** JNI cannot pass C++ types — only Java primitives and objects. The `jsi::Runtime*` pointer is passed as a `Long` (64-bit integer) from Kotlin and received as `jlong` in C++. Cast it back with `reinterpret_cast<jsi::Runtime*>(jsiRuntimeRef)`. This is how every production JSI library (MMKV, Reanimated) does it.

### JNI Glue — The C++ Bridge

The JNI function name must match the Kotlin class's fully qualified name exactly. If your package is `com.mymodule` and the class is `MyModule` and the method is `nativeInstall`, the C++ function **must** be named `Java_com_mymodule_MyModule_nativeInstall`. Dots become underscores; a mismatch causes `UnsatisfiedLinkError` at runtime.

```cpp
// android/cpp/MyModule-jni.cpp
#include <jni.h>
#include <jsi/jsi.h>
#include "install.h"

using namespace facebook;

extern "C"            // prevent C++ name mangling so JNI can find the symbol
JNIEXPORT jboolean JNICALL
Java_com_mymodule_MyModule_nativeInstall(
    JNIEnv *env,      // JNI environment — needed for Java interop
    jobject thiz,     // the Java `this` (MyModule instance)
    jlong jsiRuntimeRef
) {
    auto *runtime = reinterpret_cast<jsi::Runtime *>(jsiRuntimeRef);
    if (runtime == nullptr) return false;

    install(*runtime);
    return true;
}
```

### CMakeLists.txt Structure

```cmake
# android/CMakeLists.txt
cmake_minimum_required(VERSION 3.13)
project(mymodule)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Provides ReactAndroid::jsi and other RN C++ targets
find_package(ReactAndroid REQUIRED CONFIG)

add_library(mymodule SHARED
    cpp/MyModule-jni.cpp     # JNI glue
    ../cpp/install.cpp       # shared platform-agnostic C++
)

target_include_directories(mymodule PRIVATE
    ../cpp                   # finds install.h
)

target_link_libraries(mymodule
    ReactAndroid::jsi        # jsi::Runtime, jsi::Value, etc.
    android                  # Android NDK base
    log                      # __android_log_print (Android logging)
)
```

Wire CMake into Gradle:

```groovy
// android/build.gradle (relevant sections)
android {
    defaultConfig {
        externalNativeBuild {
            cmake {
                cppFlags '-frtti -fexceptions'  // required by JSI
                abiFilters 'armeabi-v7a', 'arm64-v8a', 'x86', 'x86_64'
            }
        }
    }
    externalNativeBuild {
        cmake {
            path 'CMakeLists.txt'
        }
    }
}

dependencies {
    implementation "com.facebook.react:react-android"
}
```

`-frtti -fexceptions` enables C++ RTTI and exception support, both required by JSI. `abiFilters` controls which CPU architectures are compiled; omitting `x86`/`x86_64` speeds up builds but drops emulator support.

### FBJNI — `JavaClass<>` and `kJavaDescriptor`

Raw JNI requires manually calling `env->FindClass()`, `env->GetMethodID()`, and managing local/global reference lifetimes everywhere. **FBJNI** (Facebook JNI) is Meta's C++ wrapper that ships as a dependency of `react-android` — no extra dependency needed.

```cpp
#include <fbjni/fbjni.h>

// Declare a C++ mirror of the Java class com.example.MyModule
struct MyModule : public facebook::jni::JavaClass<MyModule> {
    // JVM type descriptor — must exactly match the Java/Kotlin class path
    static constexpr auto kJavaDescriptor = "Lcom/example/MyModule;";

    // Type-safe method lookup: no manual GetMethodID or signature strings
    static facebook::jni::local_ref<MyModule> create() {
        return newInstance();
    }
};
```

Why FBJNI over raw JNI:
- **Reference safety** — `local_ref<T>` and `global_ref<T>` are RAII wrappers; references are released automatically.
- **Exception translation** — Java exceptions thrown during JNI calls are automatically rethrown as C++ exceptions (and vice versa).
- **Type-safe method lookup** — `getMethod<jint(jlong)>("nativeInstall")` is checked at compile time; raw JNI uses untyped strings that fail at runtime.
- **`kJavaDescriptor`** — the JVM type descriptor string (e.g., `"Lcom/example/MyModule;"`) used by `FindClass`. FBJNI reads it via the template parameter so you never pass it manually.

For JSI install code the FBJNI advantage is modest — you're writing a thin one-shot glue function. FBJNI becomes more valuable when the C++ side needs to hold references to Java objects or call back into Java from background threads.

### `JSIModulePackage` — Where to Register

`JSIModulePackage` is the Android hook for registering JSI modules through React Native's package system. The most common pattern in Bridge-mode apps is a `ReactPackage` that returns your module from `createNativeModules`:

```kotlin
// MyModulePackage.kt
class MyModulePackage : ReactPackage {
    override fun createNativeModules(
        reactContext: ReactApplicationContext
    ): List<NativeModule> = listOf(MyModule(reactContext))

    override fun createViewManagers(
        reactContext: ReactApplicationContext
    ): List<ViewManager<*, *>> = emptyList()
}
```

Register the package in `MainApplication`:

```kotlin
// MainApplication.kt
override fun getPackages(): List<ReactPackage> =
    PackageList(this).packages.apply {
        add(MyModulePackage())
    }
```

For the New Architecture (RN 0.76+), register via `TurboReactPackage` or the codegen path instead. The `MyModulePackage` pattern above works with the Old Architecture and the Bridge compatibility layer in RN 0.76+.

---

## Library Templates

| Template | Command / URL | Notes |
|----------|--------------|-------|
| **create-react-native-library** *(recommended)* | `npx create-react-native-library@latest MyLib` → choose *"C++ for both iOS & Android"* | Actively maintained, sets up TurboModule + JSI boilerplate, CMakeLists, podspec |
| mrousavy/react-native-jsi-library-template | GitHub: `mrousavy/react-native-jsi-library-template` | Minimal JSI-only template, good for learning the wiring |
| ospfranco/react-native-jsi-template | GitHub: `ospfranco/react-native-jsi-template` | Another minimal template, sqlite-focused examples |
| ammarahm-ed/react-native-jsi-template | GitHub: `ammarahm-ed/react-native-jsi-template` | Simple JSI setup without TurboModule overhead |

Start with `create-react-native-library` unless you have a specific reason to use a minimal template — it handles the platform glue that's easy to get wrong.

---

## JSI vs TurboModules vs Nitro Modules

| | **Raw JSI** | **TurboModules** | **Nitro Modules** |
|-|------------|-----------------|------------------|
| **What it is** | Bare C++ engine API | RN's official native module system, built on JSI | Third-party alternative to TurboModules (mrousavy) |
| **Type safety** | Manual — you check types at runtime | Schema-generated from TypeScript spec | Schema-generated from TypeScript; stricter types |
| **Codegen** | None | Yes (`react-native-codegen`) | Yes (Nitrogen codegen) |
| **Async support** | Manual (Promise + CallInvoker) | Built-in via Promise return type | Built-in |
| **Performance** | Maximum — you control everything | Good | Slightly faster than TurboModules (fewer layers) |
| **Maintenance burden** | High — all boilerplate manual | Low — mostly generated | Low — mostly generated |
| **Best for** | Libraries with unusual requirements, learning JSI internals | Standard native modules shipping with React Native | Third-party libraries targeting maximum performance |

For most library authors, **TurboModules** (via `create-react-native-library`) is the right choice. Use raw JSI only when you need capabilities that TurboModules don't expose — such as `HostObject` with intercepted property access, custom `ArrayBuffer` providers, or a custom runtime decorator.
