# Casting and Serialization

---

## The `get` vs `as` Naming Convention

This convention applies **everywhere** in the JSI API — on `Value`, `Object`, `Array`, `Function`, and `BigInt`. It is not per-type sugar; it's a system-wide contract.

| Prefix | Behavior on type mismatch | When to use |
|--------|--------------------------|-------------|
| `getXxx()` | `assert()` — crashes in debug, undefined in release | When a wrong type is a programming error you'll catch in testing |
| `asXxx()` | Throws `jsi::JSIException` | When a wrong type can come from untrusted input (JS calling your binding) |

```cpp
// Value extractors
v.getNumber()     // assert on non-number
v.asNumber()      // throws JSIException on non-number

v.getBool()       v.asBool()
v.getString(rt)   v.asString(rt)
v.getObject(rt)   v.asObject(rt)
v.getSymbol(rt)   v.asSymbol(rt)
v.getBigInt(rt)   v.asBigInt(rt)

// Object subtype downcasts
obj.getArray(rt)        obj.asArray(rt)
obj.getFunction(rt)     obj.asFunction(rt)
obj.getArrayBuffer(rt)  // assert only (no asArrayBuffer currently)
obj.getHostObject(rt)   obj.asHostObject(rt)
```

**Prefer `asXxx()` in HostFunction / HostObject implementations** — when JS is the caller, types can be wrong at runtime and you want a catchable error, not a crash.

---

## `getPropertyAsObject` and `getPropertyAsFunction`

These helpers combine property lookup + type downcast in one call and produce a **much better error message** when the property is missing or has the wrong type.

```cpp
// This gives "Object is not a function" — no info about which property
auto fn = obj.getProperty(rt, "onData").asObject(rt).asFunction(rt);

// This gives "Property 'onData' is not a function" — immediately actionable
auto fn = obj.getPropertyAsFunction(rt, "onData");

// Same pattern for object properties
auto sub = obj.getPropertyAsObject(rt, "options");
```

Always prefer `getPropertyAsObject` / `getPropertyAsFunction` over the chained version when you're working with properties by name.

---

## String Creation: ASCII vs UTF-8 vs UTF-16

Choosing the right constructor avoids unnecessary transcoding:

```cpp
// Pure ASCII content — fastest path, no encoding conversion
jsi::String s1 = jsi::String::createFromAscii(rt, "hello");
jsi::String s2 = jsi::String::createFromAscii(rt, "hello", 5);
jsi::String s3 = jsi::String::createFromAscii(rt, std::string("hello"));

// Arbitrary text, UTF-8 encoded (most C++ strings)
jsi::String s4 = jsi::String::createFromUtf8(rt, "héllo");
jsi::String s5 = jsi::String::createFromUtf8(rt, utf8Bytes, byteCount);

// UTF-16 (from Java/ObjC string types, or std::u16string)
jsi::String s6 = jsi::String::createFromUtf16(rt, u"hello", 5);
jsi::String s7 = jsi::String::createFromUtf16(rt, u16string);

// PropNameID has the same three forms (forAscii / forUtf8 / forUtf16)
```

**`createFromAscii` is undefined behavior if the string contains non-ASCII bytes.** Use `createFromUtf8` for general text.

---

## Zero-Copy String Access: `getStringData`

Reading a string back from JSI via `utf8()` always allocates a `std::string`. For high-throughput paths, use the callback API which gives you a direct pointer to the engine's internal representation — no allocation, no copy:

```cpp
jsi::String str = v.asString(rt);

str.getStringData(rt, [](bool ascii, const void* data, size_t num) {
  if (ascii) {
    // data points to `num` ASCII characters
    processAscii(static_cast<const char*>(data), num);
  } else {
    // data points to `num` UTF-16 code units (char16_t)
    processUtf16(static_cast<const char16_t*>(data), num);
  }
});
// The callback may be invoked multiple times with different segments.
```

**Critical constraint:** do not call any JSI or runtime function inside the callback. The data pointer is only valid for the duration of the callback, and any runtime operation may invalidate it.

The same API exists for `PropNameID`:
```cpp
nameProp.getPropNameIdData(rt, [](bool ascii, const void* data, size_t num) {
  // ...
});
```

---

## C++ ↔ JS Type Mapping

| JS type | JSI C++ type | Create | Extract (assert / throw) |
|---------|-------------|--------|--------------------------|
| `undefined` | `Value` kind UndefinedKind | `Value()` or `Value::undefined()` | `v.isUndefined()` |
| `null` | `Value` kind NullKind | `Value(nullptr)` or `Value::null()` | `v.isNull()` |
| `boolean` | `Value` kind BooleanKind | `Value(true)` | `v.getBool()` / `v.asBool()` |
| `number` | `Value` kind NumberKind | `Value(42.0)`, `Value(42)` | `v.getNumber()` / `v.asNumber()` |
| `string` | `jsi::String` | `String::createFromAscii(rt, "x")` | `v.getString(rt)` / `v.asString(rt)` |
| `bigint` | `jsi::BigInt` | `BigInt::fromInt64(rt, n)` | `v.getBigInt(rt)` / `v.asBigInt(rt)` |
| `symbol` | `jsi::Symbol` | engine-created | `v.getSymbol(rt)` / `v.asSymbol(rt)` |
| `object` | `jsi::Object` | `Object(rt)` | `v.getObject(rt)` / `v.asObject(rt)` |
| array | `jsi::Array` | `Array(rt, len)` | `obj.getArray(rt)` / `obj.asArray(rt)` |
| function | `jsi::Function` | `Function::createFromHostFunction(...)` | `obj.getFunction(rt)` / `obj.asFunction(rt)` |
| `ArrayBuffer` | `jsi::ArrayBuffer` | `ArrayBuffer(rt, buffer)` | `obj.getArrayBuffer(rt)` |

---

## `Value::createFromJsonUtf8`

Parses a JSON string directly into a `jsi::Value`. Equivalent to calling `JSON.parse` in JS, but without the overhead of looking up the global and calling through JSI:

```cpp
std::string json = R"({"x": 1, "y": [2, 3]})";
jsi::Value parsed = jsi::Value::createFromJsonUtf8(
    rt,
    reinterpret_cast<const uint8_t*>(json.data()),
    json.size());
```

---

## `folly::dynamic` Integration

If your codebase uses Folly, `JSIDynamic.h` provides bidirectional conversion between `jsi::Value` and `folly::dynamic`:

```cpp
#include <jsi/JSIDynamic.h>

// jsi::Value → folly::dynamic
folly::dynamic d = jsi::dynamicFromValue(rt, jsValue);

// folly::dynamic → jsi::Value
jsi::Value v = jsi::valueFromDynamic(rt, d);
```

This is convenient for data that already lives in a `folly::dynamic` (e.g., parsed from a config file), but it copies all data — don't use it in tight loops.

---

## `ISerialization` — Experimental, Do Not Use in Production

`ISerialization` provides structured-clone serialization to transfer values between two runtime instances. It is gated behind a preprocessor flag and explicitly marked as unstable:

```cpp
#ifdef JSI_UNSTABLE
class ISerialization : public ICast {
  virtual std::shared_ptr<Serialized> serialize(Value& value) = 0;
  virtual Value deserialize(const std::shared_ptr<Serialized>&) = 0;
  // ...
};
#endif // JSI_UNSTABLE
```

The `JSI_UNSTABLE` guard means this API may change or be removed without notice. On top of that, enabling it requires building Hermes from source with the flag defined — it is not available in the prebuilt Hermes binaries shipped with React Native. Do not build production code on top of it. For transferring data across runtimes, use serializable C++ types and re-construct JS values on the receiving side.
