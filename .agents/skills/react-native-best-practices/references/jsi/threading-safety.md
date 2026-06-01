# Threading Safety

---

## The Single-Thread Rule

From `jsi.h` (emphasis added):

> "Note that this object may not be thread-aware, but cannot be used safely from multiple threads at once. The application is responsible for ensuring that it is used safely. [...] **This restriction applies to the methods of this class, and any method in the API which take a `Runtime&` as an argument.**"

Every JSI call that accepts `Runtime&` must be made from the same thread that owns the runtime — typically the React Native JS thread. There is no internal locking. Concurrent access from two threads, even if each call looks atomic, produces data races and undefined behavior.

This includes:
- Reading and writing JS properties
- Calling JS functions
- Creating JSI values
- Installing HostObjects or HostFunctions

---

## Write Operations Are Also Forbidden From Multiple Threads

The single-thread rule applies even to operations that don't take `Runtime&`. From `jsi.h`:

> "it is still forbidden to make write operations on a single instance of any class from more than one thread"

`jsi::Value` (and other JSI types) hold a `PointerValue*` that points into engine-managed memory. Assigning or destroying a `Value` from two threads simultaneously corrupts that pointer — no locks anywhere will save you.

The only safe operations to perform from a non-RT thread are those that don't touch the engine at all, like checking a `bool` flag you set before queuing work.

---

## JSI Object Destruction Order

JSI objects (`Value`, `Object`, `Function`, etc.) hold a `PointerValue*` handle that the engine must invalidate when the object is destroyed. **JSI objects must be destroyed before the runtime is destroyed.**

If a `Value` or `Object` outlives its runtime, its destructor will call `ptr_->invalidate()` on a now-dead engine — a crash or silent corruption.

Problematic pattern:
```cpp
// DON'T: jsi::Value stored in a long-lived container
struct AppState {
  jsi::Runtime* rt;
  jsi::Value cachedFn; // ← will outlive rt if AppState lives longer
};
```

Safe pattern: ensure all JSI objects are destroyed or explicitly invalidated before the runtime is shut down. If you need a long-lived reference, use a `jsi::WeakObject` (which handles invalidation gracefully) or keep ownership scoped to the runtime's lifetime.

---

## `jsi::Value` Is Non-Copyable — The `shared_ptr` Pattern

`jsi::Value` has no copy constructor. This prevents accidental copies (which would require a `Runtime&` to clone). It does have a move constructor.

When you need to share ownership of a `Value` across callbacks or threads, wrap it in `std::shared_ptr`:

```cpp
// Capture a JS callback to call later from an async path
auto sharedCallback = std::make_shared<jsi::Value>(rt, callbackArg);
// Or move (no clone):
auto sharedCallback = std::make_shared<jsi::Value>(std::move(callbackArg));

// Store it, pass to a background thread, etc.
asyncOperation([sharedCallback, &callInvoker]() {
  // Back on the JS thread via CallInvoker:
  callInvoker->invokeAsync([sharedCallback](jsi::Runtime& rt) {
    sharedCallback->asObject(rt).asFunction(rt).call(rt);
  });
});
```

The `shared_ptr` keeps the `Value` alive across threads. Critically, **you still may only call JSI methods on it from the JS thread** — ownership and thread-safety are separate concerns.

---

## Hot Reload / Bundle Reload Pitfall

When React Native reloads the JS bundle (hot reload, `cmd+R`, error recovery), the old `jsi::Runtime` is torn down and a new one is created. Any `shared_ptr<jsi::Value>` you kept alive across the reload now holds a handle into the destroyed runtime.

Destroying that `shared_ptr` after the old runtime is gone calls `ptr_->invalidate()` on dead memory — a crash.

**Mitigation:** tie the lifetime of your stored JSI values to a weakly-held context object that is cleared when the runtime is about to be torn down. React Native's `TurboModule` lifecycle provides hooks for this. Alternatively, store only C++ data across reloads and reinstall JS objects on each new runtime.

---

## `WithRuntimeDecorator<AroundLock>` — Adding a Mutex

When you must access a runtime from multiple threads (e.g., because your architecture allows JS calls from any thread via a dispatch queue), `jsi::WithRuntimeDecorator` wraps a runtime and calls user-provided hooks before and after every JSI operation:

```cpp
#include <jsi/decorator.h>

struct MyLock {
  std::mutex mu;

  void before() { mu.lock(); }
  void after()  { mu.unlock(); }
};

// Wrap the real runtime
MyLock lock;
jsi::WithRuntimeDecorator<MyLock> safeRuntime(underlyingRuntime, lock);

// Use safeRuntime everywhere — every JSI call acquires mu first
```

This pattern is rarely needed for typical native modules, which always run HostFunctions on the JS thread. Use it when you're building a custom runtime host that genuinely needs concurrent access.
