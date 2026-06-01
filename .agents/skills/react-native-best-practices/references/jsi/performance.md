# JSI Performance

---

## Batch Data Instead of Sequential Calls

Each JSI call that goes into the engine has overhead: vtable dispatch, potential engine lock contention, and crossing the C++/engine boundary. Calling a JS function N times in a loop is far more expensive than calling it once with an array of N items.

```cpp
// Slow: N round-trips into the JS engine
for (auto& item : items) {
  onItemCallback.call(rt, item.id, item.value);
}

// Fast: one call, all data at once
auto arr = jsi::Array::createWithElements(rt,
    std::initializer_list<jsi::Value>{...});
onItemsCallback.call(rt, std::move(arr));
```

This matters especially for data streaming (sensor readings, video frames, bulk inserts). Batch on the C++ side before crossing into JS.

---

## Cache `PropNameID` as Class Members

`PropNameID` construction requires an engine call to intern the string. If you look up the same property name repeatedly (e.g., in a HostObject `get` that fires on every property access), constructing a new `PropNameID` each time is wasteful.

```cpp
// Slow: creates a new PropNameID (and interns the string) on every get() call
jsi::Value MyHost::get(jsi::Runtime& rt, const jsi::PropNameID& name) override {
  if (jsi::PropNameID::compare(rt, name, jsi::PropNameID::forAscii(rt, "x")))
    return jsi::Value(x_);
  if (jsi::PropNameID::compare(rt, name, jsi::PropNameID::forAscii(rt, "y")))
    return jsi::Value(y_);
  return jsi::Value::undefined();
}

// Fast: intern once in the constructor, compare pointer-cheap IDs
class MyHost : public jsi::HostObject {
  jsi::PropNameID xProp_, yProp_;
public:
  MyHost(jsi::Runtime& rt)
    : xProp_(jsi::PropNameID::forAscii(rt, "x")),
      yProp_(jsi::PropNameID::forAscii(rt, "y")) {}

  jsi::Value get(jsi::Runtime& rt, const jsi::PropNameID& name) override {
    if (jsi::PropNameID::compare(rt, name, xProp_)) return jsi::Value(x_);
    if (jsi::PropNameID::compare(rt, name, yProp_)) return jsi::Value(y_);
    return jsi::Value::undefined();
  }
};
```

---

## Zero-Copy `ArrayBuffer` via `MutableBuffer`

The default way to pass binary data to JS is to copy it. With `MutableBuffer` you can hand ownership of your existing allocation directly to the engine — no copy:

```cpp
class OwnedBuffer : public jsi::MutableBuffer {
  std::vector<uint8_t> data_;
public:
  explicit OwnedBuffer(std::vector<uint8_t> data) : data_(std::move(data)) {}
  size_t size() const override { return data_.size(); }
  uint8_t* data() override { return data_.data(); }
};

// Hand the buffer to the ArrayBuffer — no copy, no extra allocation
auto buf = std::make_shared<OwnedBuffer>(std::move(rawData));
jsi::ArrayBuffer ab(rt, buf);
rt.global().setProperty(rt, "sharedBuffer", std::move(ab));
```

JS can then read from the `ArrayBuffer` view directly. The `OwnedBuffer` stays alive as long as the JS `ArrayBuffer` is reachable, then is destroyed by the GC.

For even more control, implement `MutableBuffer` over memory-mapped files or shared memory regions.

---

## `setExternalMemoryPressure`

Tell the GC about native memory held by a JS object. This helps the GC make smarter scheduling decisions — without this hint, it only sees the small JS object wrapper and may defer collection while large native allocations accumulate.

```cpp
jsi::Object wrapper(rt);
wrapper.setNativeState(rt, std::make_shared<LargeNativeBuffer>(64 * 1024 * 1024));

// Tell the GC this object retains 64 MB of native memory
wrapper.setExternalMemoryPressure(rt, 64 * 1024 * 1024);
```

Call this whenever the associated native memory size changes. The previous value is overwritten on each call. Once the JS object is GC'd, the pressure is automatically released.

---

## `Scope` in Tight Loops

Allocating many short-lived JSI values inside a loop inflates the GC's working set until the next collection. Wrapping each iteration in a `Scope` lets the engine reclaim temporaries eagerly:

```cpp
for (auto& item : largeDataset) {
  jsi::Scope scope(rt);
  jsi::Object jsObj(rt);
  jsObj.setProperty(rt, "id", jsi::Value(item.id));
  jsObj.setProperty(rt, "name", jsi::String::createFromUtf8(rt, item.name));
  processCallback.call(rt, std::move(jsObj));
  // scope destructs here — engine may free temporaries before next iteration
}
```

Implementations are not required to honor `Scope`, but Hermes does, and the cost of a Scope push/pop is negligible.

---

## Avoid `evaluateJavaScript` for Function Calls

`evaluateJavaScript` compiles the source on each invocation. If you know which JS function you want to call, look it up once and call it via the JSI function API — it skips compilation entirely:

```cpp
// Slow: parses, compiles, and runs JS source on every call
rt.evaluateJavaScript(
    std::make_shared<jsi::StringBuffer>("myFn(" + arg + ")"), "");

// Fast: look up once, call many times
jsi::Function myFn = rt.global().getPropertyAsFunction(rt, "myFn");
myFn.call(rt, jsi::String::createFromUtf8(rt, arg));
```

Reserve `evaluateJavaScript` for loading bundles or injecting polyfills at startup.

---

## Cross-Thread Call Performance (Historical Note)

Early versions of JSI had significant overhead when HostFunctions were called alternately from different threads — the engine's internal state had to be flushed and reloaded on each thread switch. This has been resolved in modern Hermes, but it's a useful reminder that JSI is designed for use on one thread. If you see unexpected latency in a multi-threaded setup, thread-switching overhead may be the cause.
