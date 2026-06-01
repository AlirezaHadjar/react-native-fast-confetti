# Core JSI Types

All JSI types live in `namespace facebook::jsi`. They are **movable but not copyable**. Copying requires an explicit clone via the `Runtime`.

---

## `jsi::Value`

The universal container for any JS value. Internally a tagged union — the tag is a `ValueKind` enum, the payload is a `double` (numbers/booleans) or a `Pointer` (everything else).

### Constructors

```cpp
jsi::Value v1;                        // undefined
jsi::Value v2(nullptr);              // null
jsi::Value v3(true);                 // boolean
jsi::Value v4(42.0);                 // number (double)
jsi::Value v5(42);                   // number (int, promoted to double)
jsi::Value v6(std::move(strObj));    // move from String, BigInt, Symbol, or Object

// Explicit copy — requires Runtime
jsi::Value copy(rt, original);
```

**`Value(const char*)` is intentionally deleted.** It would silently convert the pointer to a `bool`, causing hard-to-find bugs. Always create strings via `jsi::String::createFromAscii` instead.

### Type checks and extractors

See `casting-and-serialization.md` for the `get` vs `as` naming convention that governs extraction.

```cpp
v.isUndefined()  v.isNull()   v.isBool()
v.isNumber()     v.isString() v.isBigInt()
v.isSymbol()     v.isObject()

// assert on mismatch:        throws JSIException on mismatch:
v.getBool()                   v.asBool()
v.getNumber()                 v.asNumber()
v.getString(rt)               v.asString(rt)
v.getObject(rt)               v.asObject(rt)
v.getSymbol(rt)               v.asSymbol(rt)
v.getBigInt(rt)               v.asBigInt(rt)
```

For pointer types (String, Object, Symbol, BigInt), the const-ref overload clones the value; the rvalue-ref overload moves it without cloning:

```cpp
jsi::String s1 = v.getString(rt);       // clones
jsi::String s2 = std::move(v).getString(rt); // moves, v is now invalid
```

### Strict equality

```cpp
bool eq = jsi::Value::strictEquals(rt, a, b);
// Mirrors JS === (same algorithm, including NaN !== NaN)
```

### JSON round-trip

```cpp
// Parse a JSON string directly into a Value (equivalent to JSON.parse)
auto json = R"({"x":1,"y":2})";
jsi::Value parsed = jsi::Value::createFromJsonUtf8(
    rt,
    reinterpret_cast<const uint8_t*>(json),
    strlen(json));
```

---

## `jsi::PropNameID`

A pre-resolved property key. Using a `PropNameID` instead of a raw string for repeated property lookups lets the engine skip string hashing on each access.

```cpp
// Create once, reuse many times
jsi::PropNameID nameProp = jsi::PropNameID::forAscii(rt, "name");
jsi::PropNameID ageProp  = jsi::PropNameID::forUtf8(rt, "age");

// All creation forms:
jsi::PropNameID::forAscii(rt, "key")               // C string (copies)
jsi::PropNameID::forAscii(rt, "key", 3)            // C string with length
jsi::PropNameID::forAscii(rt, std::string("key"))  // std::string
jsi::PropNameID::forUtf8(rt, bytes, length)        // raw UTF-8 bytes
jsi::PropNameID::forUtf8(rt, std::string("key"))   // std::string as UTF-8
jsi::PropNameID::forUtf16(rt, chars, length)       // UTF-16 code units
jsi::PropNameID::forString(rt, jsString)           // from jsi::String
jsi::PropNameID::forSymbol(rt, jsSymbol)           // from jsi::Symbol
```

**Performance tip:** cache `PropNameID` values as class members when you'll use them repeatedly — construction involves an engine call:

```cpp
class MyBinding {
  jsi::PropNameID nameProp_;
  jsi::PropNameID onDataProp_;
public:
  MyBinding(jsi::Runtime& rt)
    : nameProp_(jsi::PropNameID::forAscii(rt, "name")),
      onDataProp_(jsi::PropNameID::forAscii(rt, "onData")) {}
};
```

---

## `HostFunctionType` and `HostFunction`

`HostFunctionType` is a `std::function` that wraps a C++ function callable from JS:

```cpp
using HostFunctionType = std::function<
    jsi::Value(jsi::Runtime& rt,
               const jsi::Value& thisVal,
               const jsi::Value* args,
               size_t count)>;
```

Create a JS `Function` from one:

```cpp
auto fn = jsi::Function::createFromHostFunction(
    rt,
    jsi::PropNameID::forAscii(rt, "add"),
    2, // length hint (doesn't restrict actual arg count)
    [](jsi::Runtime& rt, const jsi::Value&, const jsi::Value* args, size_t count) {
      double a = args[0].asNumber();
      double b = args[1].asNumber();
      return jsi::Value(a + b);
    });
```

**Destructor caveat:** the `std::function`'s destructor runs when the GC finalizes the JS function — on an arbitrary thread, potentially after the runtime is shut down. Any objects captured in the closure must be safe to destroy on any thread.

---

## `jsi::HostObject`

Lets a C++ object appear as a JS object. JS property reads and writes dispatch to C++ virtual methods.

```cpp
class MyResource : public jsi::HostObject {
public:
  jsi::Value get(jsi::Runtime& rt, const jsi::PropNameID& name) override {
    if (jsi::PropNameID::compare(rt, name, jsi::PropNameID::forAscii(rt, "value"))) {
      return jsi::Value(42.0);
    }
    return jsi::Value::undefined();
  }

  void set(jsi::Runtime& rt, const jsi::PropNameID& name,
           const jsi::Value& value) override {
    // handle property assignment
  }

  std::vector<jsi::PropNameID> getPropertyNames(jsi::Runtime& rt) override {
    return { jsi::PropNameID::forAscii(rt, "value") };
  }
};

// Install
auto obj = jsi::Object::createFromHostObject(
    rt, std::make_shared<MyResource>());
rt.global().setProperty(rt, "myResource", std::move(obj));
```

### GC destructor constraints

The C++ destructor is called by the GC when the JS object is collected — which may happen on **any thread** and at **any time** (including during runtime shutdown). At that point:

- **No `Runtime&` is available.** You cannot call any JSI API.
- **No expensive work.** The destructor runs inside the GC; blocking it stalls collection.
- **No JS operations.** Any call that requires the runtime will crash or assert.

If cleanup requires JSI or significant work, enqueue it to a work queue and process it from the JS thread:

```cpp
~MyResource() override {
  cleanupQueue_.push(resourceId_); // non-blocking, thread-safe queue
}
```

---

## `jsi::NativeState`

A simpler alternative to `HostObject` for attaching C++ data to a JS object without intercepting property access. The object still looks like a plain JS object to JS code.

```cpp
class MyData : public jsi::NativeState {
public:
  int id;
  explicit MyData(int id) : id(id) {}
};

// Attach
jsi::Object obj(rt);
obj.setNativeState(rt, std::make_shared<MyData>(42));

// Retrieve
if (obj.hasNativeState<MyData>(rt)) {
  auto data = obj.getNativeState<MyData>(rt); // asserts if wrong type
  int id = data->id;
}
```

Same GC destructor constraints as `HostObject` apply.

---

## `jsi::WeakObject`

A weak reference to a JS object. The object can be garbage-collected even if a `WeakObject` holds a reference to it.

```cpp
jsi::WeakObject weak(rt, strongObj);

// Lock: returns the Object wrapped in a Value if still alive, undefined if GC'd
jsi::Value locked = weak.lock(rt);
if (!locked.isUndefined()) {
  jsi::Object obj = locked.asObject(rt);
  // use obj...
}
```

---

## `jsi::Array`

A JS array. Inherits from `Object`.

```cpp
// Create with a fixed size (elements are undefined)
jsi::Array arr(rt, 3);
arr.setValueAtIndex(rt, 0, jsi::Value(1.0));
arr.setValueAtIndex(rt, 1, jsi::Value(2.0));
arr.setValueAtIndex(rt, 2, jsi::Value(3.0));

// Convenient construction from values
auto arr2 = jsi::Array::createWithElements(rt, 1.0, 2.0, 3.0);
auto arr3 = jsi::Array::createWithElements(rt, {
    jsi::Value(1.0), jsi::Value(true)});

// Access
size_t len = arr.size(rt);   // or arr.length(rt) — same thing
jsi::Value el = arr.getValueAtIndex(rt, 0); // throws JSIException if out of range
```

---

## `jsi::ArrayBuffer`

A JS `ArrayBuffer` backed by a C++ `MutableBuffer`. The key feature is that you can provide your own memory — no copy on construction.

```cpp
class MyBuffer : public jsi::MutableBuffer {
  std::vector<uint8_t> data_;
public:
  explicit MyBuffer(std::vector<uint8_t> data) : data_(std::move(data)) {}
  size_t size() const override { return data_.size(); }
  uint8_t* data() override { return data_.data(); }
};

auto buf = std::make_shared<MyBuffer>(std::move(rawData));
jsi::ArrayBuffer ab(rt, buf);

// Access the underlying pointer
uint8_t* ptr = ab.data(rt);
size_t   len = ab.size(rt);
```

See `performance.md` for the zero-copy pattern in detail.

---

## `jsi::BigInt`

```cpp
// Create
jsi::BigInt b1 = jsi::BigInt::fromInt64(rt, -9223372036854775807LL);
jsi::BigInt b2 = jsi::BigInt::fromUint64(rt, 18446744073709551615ULL);

// Read — two flavors:
// getXxx: truncates silently, no exception
int64_t  trunc = b1.getInt64(rt);
// asXxx:  throws JSIException if the value doesn't fit without loss
int64_t  exact = b1.asInt64(rt);
bool fits = b1.isInt64(rt); // check before asInt64 if you want to handle the case

// Convert to string in any base
jsi::String s = b1.toString(rt, 16); // "0x..." equivalent
```

---

## `jsi::Scope`

An RAII hint telling the engine it can eagerly reclaim temporary values when the scope exits, instead of waiting for the next GC cycle. Implementations may ignore this hint.

```cpp
{
  jsi::Scope scope(rt);
  // allocate many temporary JSI objects here
  for (auto& item : items) {
    jsi::Value v = processItem(rt, item);
    // ...
  }
} // engine may free temporaries here, before the next GC

// Alternatively, as a static helper with a lambda
jsi::Scope::callInNewScope(rt, [&] {
  // work here
});
```

Use `Scope` around tight loops that allocate many short-lived JSI values to keep memory pressure low.
