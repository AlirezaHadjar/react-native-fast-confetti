---
name: jsi
description: "React Native JSI (JavaScript Interface) — C++ API for interacting with the JS runtime. Use whenever the user asks about or writes C++ code that touches JSI types or patterns: jsi::Runtime, jsi::Value, jsi::Object, jsi::Function, jsi::Array, jsi::ArrayBuffer, jsi::String, jsi::Symbol, jsi::BigInt, jsi::PropNameID, jsi::HostObject, jsi::HostFunction, jsi::NativeState, jsi::WeakObject, jsi::Scope, JSIException, JSINativeException, JSError, HostFunctionType, createFromHostFunction, getHostObject, setNativeState, evaluateJavaScript, queueMicrotask, drainMicrotasks, setRuntimeData, getRuntimeData, ISerialization, rt.global(), jsi.h, jsi-inl.h, JSI binding, C++ native module, calling JS from C++, calling C++ from JS, HostObject destructor, shared_ptr, CallInvoker, invokeAsync, folly::dynamic with JSI, zero-copy ArrayBuffer, TurboModule C++ layer, Nitro Module, jsi::WithRuntimeDecorator, or any question about the boundary between C++ and the JavaScript engine in React Native."
---

# React Native JSI

The JavaScript Interface (JSI) is a C++ API that lets native code interact directly with the JavaScript engine — reading and writing JS values, calling JS functions, and exposing C++ objects to JS — without going through the old async bridge.

## References

Load at most one reference file per question. Prefer the most specific match.

| File | Load when question is about |
|------|-----------------------------|
| `overview.md` | JSI architecture, why `rt.global()`, sync vs async model, why some methods take `Runtime&`, event loop absence, `queueMicrotask`/`drainMicrotasks`, `setRuntimeData`/`getRuntimeData`, `evaluateJavaScript` caveat, prototype manipulation |
| `core-types.md` | JSI type system: `Value`, `PropNameID`, `HostFunction`, `HostObject`, `NativeState`, `WeakObject`, `Array`, `ArrayBuffer`, `BigInt`, `Scope` — constructors, ownership, lifetimes, GC behavior |
| `casting-and-serialization.md` | The `get`/`as` naming convention, `getPropertyAsObject`/`getPropertyAsFunction`, string encoding (`createFromAscii` vs `createFromUtf8`), zero-copy string access, C++↔JS type mapping, `createFromJsonUtf8`, `folly::dynamic`, `ISerialization` |
| `threading-safety.md` | Single-thread rule, write operations from multiple threads, JSI object destruction order, `Value` non-copyable + `shared_ptr` pattern, hot reload / bundle reload pitfalls, `WithRuntimeDecorator<AroundLock>` |
| `calling-js-and-async.md` | Installing `HostFunction` bindings, calling JS functions from C++, `callWithThis`, `callAsConstructor` (JS Set / Map / Promise), `invokeAsync` + `CallInvoker`, Promise resolve/reject patterns, `JSIException` hierarchy |
| `performance.md` | Batching sequential calls, caching `PropNameID`, zero-copy `ArrayBuffer` via `MutableBuffer`, `setExternalMemoryPressure`, `Scope` in tight loops, avoiding `evaluateJavaScript` for function calls |
| `setup-and-templates.md` | Installing a JSI binding in Android (FBJNI, JSIModulePackage) and iOS (ObjC++ `.mm`), library scaffolding templates, JSI vs TurboModules vs Nitro Modules |
| `module-approaches.md` | Choosing between Pure JSI, TurboModules, Nitro Modules, or a pure C++ core with thin adapter — decision tree, trade-offs, boilerplate comparison |
| `cpp-memory-patterns.md` | C++ memory for JS developers: `unique_ptr`, `shared_ptr`, `std::move`, lambda captures, RAII, circular ownership, the GC boundary between JS heap and native heap |
| `debugging-and-pitfalls.md` | Crash traces, symbolication (`c++filt`, `addr2line`, `atos`, `ndk-stack`), ASan, common JSI crash patterns, pre-ship checklist |
