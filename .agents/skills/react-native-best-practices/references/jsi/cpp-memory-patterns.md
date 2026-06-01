# C++ Memory Patterns for JSI

JSI modules operate across two heaps with different ownership rules. Getting the boundary wrong causes use-after-free crashes or silent leaks.

---

## The Two-Heap Boundary

```
┌───────────────────────────────┐   ┌───────────────────────────────┐
│      GC Heap (Hermes)         │   │      Native Heap (C++)        │
│                               │   │                               │
│  Non-deterministic cleanup    │   │  Deterministic — freed when   │
│  JS objects, strings, funcs   │   │  shared_ptr refcount = 0      │
│  jsi::Value handles           │   │  HostObjects, buffers, state  │
└──────────────┬────────────────┘   └────────────────┬──────────────┘
               │           ◆ BOUNDARY ◆              │
               │    shared_ptr bridges both worlds   │
               └─────────────────────────────────────┘
```

When you install a HostObject, the runtime takes a `shared_ptr` copy — two owners exist. The C++ object is freed only when both release their reference:

```cpp
void install(jsi::Runtime& rt) {
    auto store = std::make_shared<KVStoreHostObject>(); // refcount = 1

    auto obj = jsi::Object::createFromHostObject(rt, store);
    rt.global().setProperty(rt, "NativeKV", std::move(obj));
    // refcount = 2: `store` local + runtime's copy

} // `store` destroyed → refcount = 1; object survives
  // When JS drops NativeKV and GC runs → refcount = 0 → destructor runs
```

**JSI value handles (`jsi::Value`, `jsi::Object`, `jsi::Function`) are invalid outside the current synchronous call.** The GC can move or free the underlying object without notice. Never store them as raw pointers or member variables.

To hold a JS callback for async use, wrap it in a `shared_ptr`:

```cpp
auto callback = std::make_shared<jsi::Value>(std::move(callbackArg));

asyncWork([callback, invoker]() {
    invoker->invokeAsync([callback](jsi::Runtime& rt) {
        callback->asObject(rt).asFunction(rt).call(rt);
    });
});
```

---

## Lambda Captures in JSI Context

JSI functions are often stored and called later — from a background thread, after the installing function has returned. Capturing locals by reference (`[&]`) dangles immediately:

```cpp
// WRONG — [&db] dangles after install() returns
void install(jsi::Runtime& rt, std::shared_ptr<Database> db) {
    auto fn = jsi::Function::createFromHostFunction(rt, name, 1,
        [&db](...) { return db->query(...); }); // db is a local — gone after install() returns
    rt.global().setProperty(rt, "query", std::move(fn));
} // ← db destroyed here; lambda now holds a dangling reference

// CORRECT — [db] copies the shared_ptr, lambda keeps it alive
void install(jsi::Runtime& rt, std::shared_ptr<Database> db) {
    auto fn = jsi::Function::createFromHostFunction(rt, name, 1,
        [db](...) { return db->query(...); }); // lambda owns a share of db
    rt.global().setProperty(rt, "query", std::move(fn));
}
```

Rule: **any lambda stored by the runtime or passed to a background thread must capture `shared_ptr` by value**, never by reference.

---

## `[this]` is Unsafe in HostObject Methods

JavaScript can extract a method from a HostObject, drop the object, wait for GC, and then call the extracted function. At that point `this` is freed memory:

```cpp
// WRONG
jsi::Value get(jsi::Runtime& rt, const jsi::PropNameID& name) override {
    return jsi::Function::createFromHostFunction(rt, name, 0,
        [this](...) { count_++; return jsi::Value(count_); }); // raw this — can dangle
}
```

Use `weak_from_this()` (requires `std::enable_shared_from_this`):

```cpp
class CounterHostObject
    : public jsi::HostObject,
      public std::enable_shared_from_this<CounterHostObject> {
public:
    jsi::Value get(jsi::Runtime& rt, const jsi::PropNameID& name) override {
        auto weak = weak_from_this();
        return jsi::Function::createFromHostFunction(rt, name, 0,
            [weak](...) -> jsi::Value {
                auto self = weak.lock();
                if (!self) throw jsi::JSError(rt, "Counter was destroyed");
                self->count_++;
                return jsi::Value(self->count_);
            });
    }
private:
    int count_ = 0;
};
```

| Capture | Use when | Risk |
|---------|----------|------|
| Raw `this` | Synchronous call only, never stored by JS | Dangling if JS stores the function |
| `shared_from_this()` | C++ must keep object alive (timer, background) | Prevents GC from ever freeing it |
| `weak_from_this()` | Function may outlive the HostObject | Graceful failure via `.lock()` check |

Default to `weak_from_this()` for any function returned from `get`.

---

## Circular `shared_ptr` Between HostObjects

`shared_ptr` reference counting cannot break cycles. If two HostObjects hold `shared_ptr` to each other, both refcounts stay above zero after JavaScript drops them — neither destructor runs, both objects leak:

```
Parent ──shared_ptr──▶ Child
  ▲                      │
  └──────shared_ptr───────┘

JS drops both → external refcounts = 0
Internal cycle keeps both at 1 → neither freed
```

**Break with `weak_ptr` on the back reference:**

```cpp
class Child : public jsi::HostObject {
    std::weak_ptr<Parent> parent_; // doesn't extend Parent's lifetime

    void notifyParent() {
        auto parent = parent_.lock(); // empty if already freed
        if (!parent) return;
        parent->onChildEvent();
    }
};
```

Rule: in any parent-child or observer relationship, the owning direction uses `shared_ptr`; back references use `weak_ptr`.

---

## RAII for Native Resources

HostObject destructors are the correct place to release resources the JS GC knows nothing about — audio sessions, database connections, thread pools. The destructor runs deterministically when the `shared_ptr` refcount reaches zero (i.e., when JS drops the last reference and GC collects):

```cpp
class AudioSessionHostObject : public jsi::HostObject {
    AVAudioSession* session_;
public:
    AudioSessionHostObject() {
        session_ = [AVAudioSession sharedInstance];
        [session_ setActive:YES error:nil];
    }
    ~AudioSessionHostObject() {
        [session_ setActive:NO error:nil]; // guaranteed to run, no JS-side cleanup needed
    }
};
```

Do not expose a manual `destroy()` method to JavaScript — callers can forget it. Tie resource lifetime to object lifetime.
