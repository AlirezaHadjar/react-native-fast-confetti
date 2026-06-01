# Module Approaches: TurboModules vs Pure JSI vs Pure C++

React Native's New Architecture offers three ways to expose native C++ to JavaScript. Each makes a different bet about what matters most. Pick wrong and you either fight the framework or lose capabilities you need.

---

## Comparison Table

| Axis | TurboModules | Pure JSI | Pure C++ + thin adapter |
|------|-------------|---------|------------------------|
| **Type safety** | Compile-time (codegen enforces spec) | Runtime (manual `isNumber()` checks) | N/A — no JS boundary in core |
| **API style** | Flat named methods only | Methods + dynamic property dispatch | Adapter-defined |
| **Boilerplate** | Low (generated); one-time spec setup | High (manual type guards, platform wiring) | Medium (thin adapter + full core) |
| **Dynamic properties** | Not supported | Full `HostObject` get/set/enumerate | Adapter-dependent |
| **Lifecycle control** | Framework-managed, unspecified destruction order | Explicit (`shared_ptr` + RAII destructors) | Fully manual |
| **Platform wiring** | Scaffolded by codegen | Manual (Obj-C++, JNI, CMake) | Manual + adapter |
| **C++ portability** | Tied to RN codegen types | Tied to `jsi::Runtime` | Any C++ platform |
| **Unit testing** | Needs RN test infra or JSI mock | Needs `jsi::Runtime` mock | Plain C++ tests, no RN |
| **Lazy loading** | Built-in (on first `TurboModuleRegistry.get`) | Manual factory functions | N/A |
| **Hermes debugger** | Full module visibility | Global-scope functions only | Adapter-dependent |
| **Prototyping speed** | Slow (spec → codegen → build) | Fast (edit C++ → rebuild) | Fastest for core logic |

---

## Decision Tree

```
Does your module need dynamic property access? (obj.anyKey, key-value store, proxy)
├── Yes → Pure JSI HostObject
└── No
    Does the core run real-time threads or need cross-platform portability?
    (audio pipeline, sensor fusion, video encoder, portable library)
    ├── Yes → Pure C++ core + thin JSI or TurboModule adapter
    └── No
        Do you need deterministic shutdown order?
        (resource interdependencies, explicit flush/join in destructor)
        ├── Yes → Pure JSI
        └── No
            Is your API a set of typed request-response methods?
            ├── Yes → TurboModule
            └── No → Pure JSI
```

Most real modules combine approaches: pure C++ for the performance-critical core, pure JSI or TurboModules for the JavaScript-facing adapter. Pick per layer, not per module.

---

## Approach 1: TurboModules

### Pattern: TypeScript spec → codegen → implement abstract C++ class

**Step 1 — Write the TypeScript spec:**

```ts
// src/NativeMath.ts
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  add(a: number, b: number): number;
  multiply(a: number, b: number): number;
  sqrt(x: number): number;
}

export default TurboModuleRegistry.getEnforcing<Spec>('NativeMath');
```

**Step 2 — Codegen produces the abstract C++ class** (runs automatically during `pod install` / Gradle build):

```cpp
// AUTO-GENERATED — NativeMathSpec.h — do not edit
class NativeMathCxxSpec : public TurboModule {
public:
  // Compiler enforces all three — missing any → build error
  virtual jsi::Value add(jsi::Runtime& rt, double a, double b) = 0;
  virtual jsi::Value multiply(jsi::Runtime& rt, double a, double b) = 0;
  virtual jsi::Value sqrt(jsi::Runtime& rt, double x) = 0;
};
```

**Step 3 — Implement the abstract class:**

```cpp
// cpp/NativeMath.h
#include <NativeMathSpec.h>

class NativeMath : public NativeMathCxxSpec {
public:
  NativeMath(std::shared_ptr<CallInvoker> jsInvoker)
      : NativeMathCxxSpec(std::move(jsInvoker)) {}

  jsi::Value add(jsi::Runtime& rt, double a, double b) override {
    return jsi::Value(a + b);
  }

  jsi::Value multiply(jsi::Runtime& rt, double a, double b) override {
    return jsi::Value(a * b);
  }

  jsi::Value sqrt(jsi::Runtime& rt, double x) override {
    return jsi::Value(std::sqrt(x));
  }
};
```

Arguments arrive pre-validated and pre-converted — `double a`, not `const jsi::Value*`. No manual type checks.

### What you give up

- **No dynamic property dispatch.** Methods are flat. A key-value store that needs `store.get("anyKey")` cannot be expressed as a TurboModule — there's no `HostObject` interception.
- **Codegen lag.** Adding a method requires updating the spec, re-running codegen, and rebuilding. Slows rapid prototyping.
- **Opaque lifecycle.** The framework owns the module via an internal `shared_ptr`. Destruction order across modules is unspecified — a problem when module A's destructor must run before module B's.

---

## Approach 2: Pure JSI

### Pattern: manual HostObject or HostFunction, installed directly on the Runtime

No spec file. No codegen. No abstract class.

**HostFunction (simple callable):**

```cpp
// cpp/install.cpp
#include <jsi/jsi.h>
using namespace facebook;

void install(jsi::Runtime& rt) {
  auto add = jsi::Function::createFromHostFunction(
      rt, jsi::PropNameID::forAscii(rt, "add"), 2,
      [](jsi::Runtime& rt, const jsi::Value&,
         const jsi::Value* args, size_t count) -> jsi::Value {
        // Manual type guard — no codegen to do this for you
        if (count < 2 || !args[0].isNumber() || !args[1].isNumber())
          throw jsi::JSError(rt, "add: expected two numbers");
        return jsi::Value(args[0].asNumber() + args[1].asNumber());
      });
  rt.global().setProperty(rt, "nativeAdd", std::move(add));
}
```

**HostObject (dynamic property dispatch):**

```cpp
// cpp/KVStoreHostObject.h
#include <jsi/jsi.h>
#include <unordered_map>
using namespace facebook;

class KVStoreHostObject : public jsi::HostObject {
public:
  // Intercepts every property read: store.get, store["anyKey"], etc.
  jsi::Value get(jsi::Runtime& rt, const jsi::PropNameID& name) override {
    auto key = name.utf8(rt);
    if (key == "set") {
      return jsi::Function::createFromHostFunction(rt, name, 2,
          [this](jsi::Runtime& rt, const jsi::Value&,
                 const jsi::Value* args, size_t) -> jsi::Value {
            store_[args[0].asString(rt).utf8(rt)] =
                args[1].asString(rt).utf8(rt);
            return jsi::Value::undefined();
          });
    }
    auto it = store_.find(key);
    if (it != store_.end())
      return jsi::String::createFromUtf8(rt, it->second);
    return jsi::Value::undefined();
  }

private:
  std::unordered_map<std::string, std::string> store_;
};

// Install:
// rt.global().setProperty(rt, "kvStore",
//     jsi::Object::createFromHostObject(rt, std::make_shared<KVStoreHostObject>()));
```

### What you give up

- **No compile-time type safety at the boundary.** You receive `const jsi::Value*` and must validate manually. Forget a check → runtime crash.
- **Manual platform wiring.** You write the Obj-C++ bridge, JNI glue, podspec, and CMakeLists.txt yourself.
- **No lazy loading by default.** `install()` runs at startup for all modules unless you implement factory functions manually.

---

## Approach 3: Pure C++ Core + Thin JSI Adapter

### Pattern: portable C++ with no JSI dependency, exposed through a minimal adapter

The core module has no `#include <jsi/jsi.h>`. It compiles and runs in a plain C++ test harness, on a server, or on an embedded device.

**Pure C++ core (no JSI):**

```cpp
// cpp/SensorFusion.h — no JSI dependency
#include <atomic>
#include <thread>

class SensorFusion {
public:
  ~SensorFusion() { stop(); }  // RAII: clean shutdown on destruction

  void start() {
    bool expected = false;
    if (!running_.compare_exchange_strong(expected, true,
            std::memory_order_relaxed)) return;
    thread_ = std::thread([this] { run(); });
  }

  void stop() {
    running_.store(false, std::memory_order_relaxed);
    if (thread_.joinable()) thread_.join();
  }

  // Lock-free read — safe from any thread
  float getHeading() const {
    return heading_.load(std::memory_order_relaxed);
  }

private:
  std::atomic<bool> running_{false};
  std::atomic<float> heading_{0.0f};
  std::thread thread_;

  void run() {
    while (running_.load(std::memory_order_relaxed)) {
      heading_.store(computeHeading(), std::memory_order_relaxed);
      std::this_thread::sleep_for(std::chrono::milliseconds(10));
    }
  }

  float computeHeading() { /* sensor fusion math */ return 0.0f; }
};
```

**Thin JSI adapter (the only file that touches JSI):**

```cpp
// cpp/install.cpp
#include <jsi/jsi.h>
#include "SensorFusion.h"
using namespace facebook;

void install(jsi::Runtime& rt) {
  auto fusion = std::make_shared<SensorFusion>();

  auto start = jsi::Function::createFromHostFunction(
      rt, jsi::PropNameID::forAscii(rt, "start"), 0,
      [fusion](jsi::Runtime&, const jsi::Value&,
               const jsi::Value*, size_t) -> jsi::Value {
        fusion->start();
        return jsi::Value::undefined();
      });

  auto getHeading = jsi::Function::createFromHostFunction(
      rt, jsi::PropNameID::forAscii(rt, "getHeading"), 0,
      [fusion](jsi::Runtime&, const jsi::Value&,
               const jsi::Value*, size_t) -> jsi::Value {
        return jsi::Value(static_cast<double>(fusion->getHeading()));
      });

  auto obj = jsi::Object(rt);
  obj.setProperty(rt, "start", std::move(start));
  obj.setProperty(rt, "getHeading", std::move(getHeading));
  rt.global().setProperty(rt, "sensorFusion", std::move(obj));
}
```

`SensorFusion` is testable with `gtest` or Catch2 — no mock runtime, no RN infra.

### What you give up

- **No direct JS interaction from the core.** The C++ module cannot call JavaScript functions, read JS objects, or throw JS errors. All communication goes through the adapter layer.
- **Two ownership domains.** The C++ module and the JSI adapter have separate lifetimes. The adapter holds a `shared_ptr` to the core — when JS drops the adapter the ref count drops, but the core's thread must also hold a `shared_ptr` (not a raw pointer) to prevent premature destruction while the thread is running.

---

## Approach 4: Nitro Modules

Nitro Modules (by Marc Rousavy, author of `react-native-mmkv`) is a third-party framework that combines TurboModule-style codegen with `HostObject`-style native object ergonomics.

### How it differs from TurboModules

| | TurboModules | Nitro Modules |
|--|-------------|--------------|
| **Codegen tool** | `react-native-codegen` | Nitrogen |
| **Generated bindings** | C++ abstract class | C++ + Swift protocols + Kotlin interfaces |
| **JS-visible API** | Flat methods on a module object | `HybridObject` instances (objects with methods + properties) |
| **Native attachment** | TurboModule registry | `jsi::NativeState` (avoids `HostObject` virtual dispatch overhead) |
| **Platform implementation** | Obj-C++ or JNI required | Swift or Kotlin, no Obj-C++/JNI glue needed |
| **Performance** | Good | ~16x faster than TurboModules for hot paths (per Nitro benchmarks) |

### HybridObject pattern

```ts
// NativeCamera.nitro.ts — Nitrogen spec
import { HybridObject } from 'react-native-nitro-modules';

export interface Camera extends HybridObject<{ ios: 'swift'; android: 'kotlin' }> {
  readonly isActive: boolean;
  start(): void;
  stop(): void;
  takePhoto(): Promise<string>;
}
```

Nitrogen generates a Swift protocol and Kotlin interface. You implement in Swift/Kotlin directly — no Obj-C++ wrapper, no JNI.

### When Nitro wins over TurboModules

- Your API returns native objects (not just scalars) that JS holds and calls methods on.
- You want codegen type safety but also Swift/Kotlin implementations without Obj-C++/JNI glue.
- You're building a high-throughput library where the TurboModule overhead is measurable (frequent small calls: audio sample callbacks, sensor readings, rendering hooks).
- You want `HybridObject` instances to be first-class — passable, storable, garbage-collected on JS side with `NativeState` cleanup.

### When TurboModules is still the right call

- You're shipping as part of the RN ecosystem and want zero third-party framework dependencies.
- Your module is mostly async I/O (network, disk) where call overhead is irrelevant.
- Your team is comfortable with Obj-C++/JNI and has no reason to add another dependency.

---

## Cleanup Semantics

The three approaches handle resource cleanup differently.

**TurboModules:** The framework owns the module via an internal `shared_ptr`. Destruction order across modules is unspecified. Safe for independent modules; dangerous for modules with resource interdependencies (module A's destructor must drain a queue before module B closes the socket it writes to).

**Pure JSI:** You own every `shared_ptr`. Destruction order is whatever your code specifies — RAII makes it explicit. You must get the order right; the framework won't catch ordering bugs.

**Pure C++:** Cleanup is entirely your responsibility. The C++ module's thread must be joined before its resources are freed. The JSI adapter's `shared_ptr` prevents premature destruction only if the background thread also holds a `shared_ptr` to the same object — a raw pointer from the thread captures is a crash waiting to happen.

The architecture choice changes *where* resources live and *when* they're freed — it does not automatically fix ownership bugs. TurboModules keep modules alive until runtime shutdown (no GC-triggered destruction). Pure JSI ties lifetime to GC reachability. Pure C++ ties it to explicit thread shutdown. Within any approach, the thread still needs a `shared_ptr`, not a raw pointer, to the data it accesses.
