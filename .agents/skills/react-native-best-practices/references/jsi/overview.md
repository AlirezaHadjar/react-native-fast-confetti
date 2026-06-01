# JSI Overview

JSI (JavaScript Interface) is a C++ header-only API that provides a language-agnostic abstraction over a JavaScript engine. It replaces the old React Native async message bridge with direct, synchronous C++ calls into the engine.

---

## React Native's Three-Thread Model

React Native runs across three execution domains. Understanding which thread a crash frame belongs to is the first step in any debugging session.

| Thread | Name in crash traces | What runs there |
|---|---|---|
| **JS Thread** | `mqt_js` | Hermes engine, all JS/TS code, JSI calls |
| **UI / Main Thread** | `main` (iOS) / app package name e.g. `com.myapp` (Android) | Native view rendering, layout, touch hit-testing (UIKit on iOS, View system on Android) |
| **Native Background** | varies (`AudioEncoder`, `RNBGThread`, etc.) | File I/O, network, audio, any heavy native work dispatched from a native module |

These domains **do not share mutable state**. In the old architecture they communicated exclusively via serialized messages. The New Architecture adds shared immutable C++ data structures (the Fabric shadow tree) and the direct JSI call path, but the fundamental isolation still holds: you cannot safely access one thread's mutable state from another.

`mqt_js` stands for "message queue thread, JavaScript" — React Native's internal name for the thread that runs the Hermes runtime. If you see `mqt_js` in a crash trace, the crash (or the concurrent activity) is happening inside the JS engine.

---

## Where JSI Sits

```
Your C++ code
      │
      ▼
  jsi::Runtime  ← the abstraction layer (jsi.h)
      │
      ▼
JS Engine (Hermes / V8 / JSC)
      │
      ▼
  Your JavaScript
```

`jsi::Runtime` is the entry point. Every JSI operation goes through a `Runtime&` reference. The concrete implementation (Hermes, V8, JSC) is behind the abstraction — your binding code is engine-agnostic.

---

## Hermes: Default Engine Since RN 0.70

Hermes is the JavaScript engine behind `jsi::Runtime` in all modern React Native apps. It became the default in RN 0.70 and is the only supported engine in the New Architecture.

**Ahead-of-time bytecode compilation.** Unlike V8 (which parses source at runtime and JIT-compiles hot paths through Ignition → Sparkplug → TurboFan), Hermes compiles JavaScript to bytecode at **build time** via the `hermesc` compiler. The sequence:

1. Metro bundles your JS into a single bundle.
2. `hermesc` compiles that bundle to Hermes bytecode (`.hbc`).
3. The app ships the bytecode. On launch, Hermes executes it directly — no parsing, no JIT warm-up.

This is why Hermes apps start faster: the most expensive part of JS engine startup is eliminated. The trade-off is no JIT: Hermes executes bytecode directly without compiling to native machine code at runtime, which lowers peak compute throughput. For UI-driven, event-based workloads this is a good trade. For compute-heavy work, the answer is native code — which is what JSI enables.

---

## Hades: Hermes's Concurrent Generational GC

Hermes uses a garbage collector called **Hades** (Hermes Approach to Decreasing Execution Stalls).

**Generational.** Objects are split into two generations:
- *Young generation* — recently allocated objects, collected frequently and cheaply (most objects die young).
- *Old generation* — objects that survived multiple young-gen collections, collected less often.

**Mostly-concurrent.** The bulk of collection work (tracing the object graph, sweeping unreachable objects) runs on a **background thread** while JavaScript continues executing. Only specific phases — root marking and weak reference finalization — require a brief **stop-the-world (STW) pause** where the JS thread is halted.

This matters for frame budgets: the old Hermes GC (GenGC) had full STW pauses that could be tens of milliseconds on large heaps. Hades reduces pause times by roughly an order of magnitude by doing most work concurrently.

**Identifying which GC is active:** Hades shipped in React Native 0.69 (Hermes 0.11). To check: look at the `hermes` version in `node_modules/hermes-engine/package.json`, or check the `hermesVersion` field in the Metro bundle output. In crash traces, GenGC appears as `facebook::hermes::vm::GenGC::collect` while Hades appears as `facebook::hermes::vm::Hades::collectOG`. Apps on RN < 0.69 use GenGC and can eliminate long GC pauses by upgrading.

**In crash traces,** Hades activity appears as `facebook::hermes::vm::Hades::collectOG` (old-generation collection) on the `mqt_js` thread. Seeing this alongside a native thread crash is a signal that GC finalization ran a C++ destructor — a common source of use-after-free bugs when ownership across the JS/native boundary is not explicit.

---

## Why Everything Goes Through `rt.global()`

A fresh `Runtime` is a blank engine with no bindings. It doesn't know about your C++ code. To make a C++ function or object callable from JS, you must install it explicitly on the global object:

```cpp
// Make a C++ function available as globalThis.myNativeFunction
auto fn = jsi::Function::createFromHostFunction(
    rt,
    jsi::PropNameID::forAscii(rt, "myNativeFunction"),
    1, // paramCount hint
    [](jsi::Runtime& rt, const jsi::Value&, const jsi::Value* args, size_t) {
      // ...
      return jsi::Value::undefined();
    });

rt.global().setProperty(rt, "myNativeFunction", std::move(fn));
```

Nothing is injected automatically. Every binding is opt-in via `rt.global()`.

---

## Sync vs Async Execution Model

JSI calls are **synchronous**. When C++ calls into JS (or JS calls into C++ via a HostFunction), both sides execute on the same thread and control returns to the caller before anything else runs. This is fundamentally different from the old RN bridge, which queued messages asynchronously across threads.

Consequences:
- JSI bindings are faster — no serialization, no thread hops for the call itself.
- The JS thread can be blocked by a slow HostFunction. Don't do heavy work synchronously in a HostFunction; return a Promise and use `CallInvoker` to resolve it from a background thread.
- `evaluateJavaScript` is also synchronous — it blocks until the script finishes.

---

## Blocking the JS Thread: What Goes Wrong

The JS thread runs a **single event loop** — one queue, one item processed at a time. Every piece of work that touches JavaScript enters this queue: touch handlers, `setTimeout` callbacks, `fetch` responses, `Promise` resolutions, and results returned from native modules via `CallInvoker`.

When a JSI HostFunction (or any synchronous JS call) takes too long, it blocks the entire queue:

```cpp
// This runs synchronously on the JS thread
// If it takes 50 ms, nothing else runs for 50 ms
auto fn = jsi::Function::createFromHostFunction(
    rt, jsi::PropNameID::forAscii(rt, "slowOp"), 0,
    [](jsi::Runtime& rt, const jsi::Value&, const jsi::Value*, size_t) {
      expensiveComputation(); // ← blocks here
      return jsi::Value::undefined();
    });
```

**Consequences of a blocked JS thread:**

- **Touch events are not processed.** The UI thread still runs — the app doesn't freeze visually — but JS-side touch handlers (`onPress`, gesture callbacks) queue up and fire late or are dropped.
- **Timers don't fire on time.** `setTimeout` and `setInterval` callbacks are queued but can't execute while the thread is occupied.
- **Animations driven from JS drop frames.** Any animation that sends a position update to the UI thread every 16 ms via JS will miss frames if the JS thread is busy. Use `useNativeDriver: true` (core Animated) or Reanimated worklets to move animations entirely to the UI thread.
- **Promise/microtask resolution is delayed.** Microtasks drain after each JS task completes; if a task is long, downstream `await` continuations are delayed by the same amount.

The practical rule: a synchronous JSI call is appropriate for work that completes in under ~1 ms (a fast lookup, a small read). Anything involving I/O, computation, or unpredictable duration belongs on a background thread, with results returned to JS via `CallInvoker` or `RuntimeExecutor`. This is covered in the threading reference.

---

## Why Some Methods Take `Runtime&` and Others Don't

Types like `jsi::Value`, `jsi::Object`, `jsi::String`, and `jsi::PropNameID` are thin wrappers around an opaque `PointerValue*` handle. The handle alone doesn't contain the data — it's a reference into the engine's heap.

Any operation that needs to read, write, or allocate within the engine must pass `Runtime&` so JSI can dispatch to the correct engine implementation. Simple operations that only manipulate the wrapper object in C++ memory (like moving or destroying it) don't need `Runtime&`.

```cpp
jsi::Value v = rt.global().getProperty(rt, "x"); // Runtime& required: reads from engine

bool isNum = v.isNumber();   // no Runtime& needed: inspects the C++ kind tag
double n   = v.getNumber();  // no Runtime& needed: reads from C++ union
```

---

## Pure Runtime Has No Event Loop

`jsi::Runtime` is a JavaScript engine, not a full JS environment. It has no event loop, no timer queue, no I/O. Microtasks (Promises) don't drain on their own unless you drain them explicitly.

### `queueMicrotask`

Enqueues a JS function as a microtask in the engine's internal Job queue:

```cpp
rt.queueMicrotask(callbackFunction);
```

### `drainMicrotasks`

Runs pending microtasks (Promise jobs). Returns `true` when the queue is fully drained, `false` when there's more work but the hint limit was reached:

```cpp
// Drain all pending microtasks
while (!rt.drainMicrotasks()) {}

// Or drain at most 10 microtasks per call
rt.drainMicrotasks(10);
```

React Native's event loop calls `drainMicrotasks` on your behalf. You only need to call it yourself if you're hosting a bare `Runtime` outside of RN (e.g., in tests or a standalone C++ app).

---

## `setRuntimeData` / `getRuntimeData`

A runtime can carry arbitrary C++ state keyed by UUID. This is the JSI equivalent of a thread-local: store shared resources (connection pools, config objects) on the runtime once, retrieve them anywhere that has a `Runtime&`.

```cpp
// Define a stable UUID for your data
static constexpr jsi::UUID kMyConfigUUID{
    0x12345678, 0x1234, 0x5678, 0x9abc, 0xdef012345678};

// Store
rt.setRuntimeData(kMyConfigUUID, std::make_shared<MyConfig>(config));

// Retrieve
auto config = std::static_pointer_cast<MyConfig>(rt.getRuntimeData(kMyConfigUUID));
```

When the runtime is destroyed or the key is overwritten, it releases ownership of the stored object.

---

## `evaluateJavaScript` — Use Sparingly

`evaluateJavaScript` compiles and runs a JS buffer. It's the right tool for bootstrapping a bundle, but expensive for anything you could do directly through the JSI API:

```cpp
// Slow: parses and executes JS to call a function
rt.evaluateJavaScript(
    std::make_shared<jsi::StringBuffer>("JSON.stringify(value)"), "");

// Fast: call the function directly through JSI
auto jsonStringify = rt.global()
    .getPropertyAsObject(rt, "JSON")
    .getPropertyAsFunction(rt, "stringify");
auto result = jsonStringify.call(rt, value);
```

Rule of thumb: if you already know the function you want to call, use JSI APIs. Reserve `evaluateJavaScript` for code that can't be expressed as a direct API call.

---

## Prototype Manipulation

JSI exposes prototype operations for cases where you need to set up a prototype chain in C++:

```cpp
// Create an object with a custom prototype
jsi::Object obj = jsi::Object::create(rt, protoValue);

// Read/write an existing object's prototype
jsi::Value proto = obj.getPrototype(rt);
obj.setPrototype(rt, newProtoValue); // throws if unsuccessful
```

These are rarely needed in typical bindings but useful when implementing class hierarchies that need to be visible to JS `instanceof` checks.
