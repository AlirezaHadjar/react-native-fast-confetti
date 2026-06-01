# Calling JS from C++ and Async Patterns

---

## Installing a HostFunction (C++ callable from JS)

Create a `jsi::Function` and set it on the global object:

```cpp
void installMyBinding(jsi::Runtime& rt) {
  auto fn = jsi::Function::createFromHostFunction(
      rt,
      jsi::PropNameID::forAscii(rt, "myNativeAdd"),
      2, // length hint
      [](jsi::Runtime& rt, const jsi::Value& thisVal,
         const jsi::Value* args, size_t count) -> jsi::Value {
        if (count < 2) throw jsi::JSINativeException("expected 2 args");
        return jsi::Value(args[0].asNumber() + args[1].asNumber());
      });

  rt.global().setProperty(rt, "myNativeAdd", std::move(fn));
}
```

Call `installMyBinding(rt)` from the RN module setup hook. After that, JS can call `globalThis.myNativeAdd(1, 2)`.

---

## Calling JS Functions from C++

### Direct call (no `this`)

```cpp
// Look up JSON.stringify and call it
jsi::Function stringify = rt.global()
    .getPropertyAsObject(rt, "JSON")
    .getPropertyAsFunction(rt, "stringify");

jsi::Value result = stringify.call(rt, someJsValue);
std::string json = result.asString(rt).utf8(rt);
```

### Call with explicit `this`

```cpp
jsi::Object console = rt.global().getPropertyAsObject(rt, "console");
jsi::Function log   = console.getPropertyAsFunction(rt, "log");

// Pass `console` as `this` so `this.prefix` works inside the function
log.callWithThis(rt, console, jsi::String::createFromAscii(rt, "hello"));
```

### Variadic template overload (convenience)

Both `call` and `callWithThis` accept variadic arguments that are implicitly converted to `jsi::Value`:

```cpp
fn.call(rt, 1.0, true, jsi::String::createFromAscii(rt, "x"));
// equivalent to:
// jsi::Value args[] = {jsi::Value(1.0), jsi::Value(true), ...};
// fn.call(rt, args, 3);
```

---

## `callAsConstructor` — Creating JS Objects from C++

Use this to call JS constructors from C++. Equivalent to `new Ctor(args...)` in JS.

```cpp
// Create a JS Set
jsi::Function SetCtor = rt.global().getPropertyAsFunction(rt, "Set");
jsi::Object set = SetCtor.callAsConstructor(rt).asObject(rt);

// Create a JS Map with initial entries
jsi::Function MapCtor = rt.global().getPropertyAsFunction(rt, "Map");
jsi::Object map = MapCtor.callAsConstructor(rt).asObject(rt);

// Create a JS Promise and extract resolve/reject
jsi::Function PromiseCtor = rt.global().getPropertyAsFunction(rt, "Promise");

std::shared_ptr<jsi::Function> resolve, reject;
auto executor = jsi::Function::createFromHostFunction(
    rt, jsi::PropNameID::forAscii(rt, "executor"), 2,
    [&resolve, &reject](jsi::Runtime& rt, const jsi::Value&,
                        const jsi::Value* args, size_t) -> jsi::Value {
      resolve = std::make_shared<jsi::Function>(args[0].asObject(rt).asFunction(rt));
      reject  = std::make_shared<jsi::Function>(args[1].asObject(rt).asFunction(rt));
      return jsi::Value::undefined();
    });

jsi::Value promise = PromiseCtor.callAsConstructor(rt, std::move(executor));
```

---

## `invokeAsync` — Calling JS from a Background Thread

The only safe way to call JSI from a background thread is to schedule a lambda onto the JS thread via `CallInvoker`. React Native provides a `CallInvoker` through the `TurboModule` or `JSCallInvokerHolder` APIs.

```cpp
// Suppose you have:
//   std::shared_ptr<facebook::react::CallInvoker> jsInvoker_;
//   std::shared_ptr<jsi::Function> resolve_;  // JS resolve callback

// In your background thread callback:
jsInvoker_->invokeAsync([resolve = resolve_, data = std::move(resultData)]
                        (jsi::Runtime& rt) mutable {
  // Now on the JS thread — safe to call JSI
  auto resultArr = jsi::Array::createWithElements(rt, data.x, data.y);
  resolve->call(rt, std::move(resultArr));
});
```

`invokeAsync` is non-blocking: the lambda is queued and your background thread continues immediately.

---

## Promise Patterns

### Pattern 1: Native function returns a Promise

```cpp
// C++ function that returns a JS Promise
jsi::Value fetchData(jsi::Runtime& rt, const jsi::Value& urlVal) {
  std::string url = urlVal.asString(rt).utf8(rt);

  jsi::Function PromiseCtor = rt.global().getPropertyAsFunction(rt, "Promise");

  std::shared_ptr<jsi::Function> resolve, reject;

  auto executor = jsi::Function::createFromHostFunction(
      rt, jsi::PropNameID::forAscii(rt, ""), 2,
      [&resolve, &reject](jsi::Runtime& rt, const jsi::Value&,
                          const jsi::Value* args, size_t) -> jsi::Value {
        resolve = std::make_shared<jsi::Function>(args[0].asObject(rt).asFunction(rt));
        reject  = std::make_shared<jsi::Function>(args[1].asObject(rt).asFunction(rt));
        return jsi::Value::undefined();
      });

  jsi::Value promise = PromiseCtor.callAsConstructor(rt, std::move(executor));

  // Kick off async work, capturing resolve/reject
  startAsyncFetch(url, resolve, reject, jsInvoker_);

  return promise;
}
```

### Pattern 2: Resolve/reject from background thread

```cpp
void startAsyncFetch(
    std::string url,
    std::shared_ptr<jsi::Function> resolve,
    std::shared_ptr<jsi::Function> reject,
    std::shared_ptr<react::CallInvoker> invoker) {

  std::thread([=, url = std::move(url)]() {
    auto result = doNetworkRequest(url); // blocking, on background thread

    invoker->invokeAsync([resolve, reject, result](jsi::Runtime& rt) mutable {
      if (result.ok) {
        auto str = jsi::String::createFromUtf8(rt, result.body);
        resolve->call(rt, std::move(str));
      } else {
        auto err = jsi::String::createFromUtf8(rt, result.error);
        reject->call(rt, std::move(err));
      }
    });
  }).detach();
}
```

---

## Exception Hierarchy

JSI has three exception types. Knowing which one you're dealing with determines how to handle it:

```
std::exception
  └── jsi::JSIException          (base — any JSI error)
        ├── jsi::JSINativeException  (API misuse, C++ side)
        └── jsi::JSError             (JavaScript execution error, JS side)
```

### `jsi::JSINativeException`

Thrown when you misuse the C++ API — wrong argument count, type mismatch caught by `as*`, invalid operation:

```cpp
throw jsi::JSINativeException("expected a non-null callback");
```

### `jsi::JSError`

Thrown when JavaScript code throws an exception. Carries the JS error object, its message, and a stack trace:

```cpp
try {
  fn.call(rt, arg);
} catch (const jsi::JSError& e) {
  std::cerr << "JS threw: " << e.getMessage() << "\n";
  std::cerr << "Stack:\n"   << e.getStack()   << "\n";
  const jsi::Value& jsVal = e.value(); // the actual JS Error object
}
```

### Catching both

```cpp
try {
  fn.call(rt, args, count);
} catch (const jsi::JSError& e) {
  // JS-side error — surface to the user or propagate as a rejected Promise
} catch (const jsi::JSINativeException& e) {
  // C++-side API misuse — usually a programming error
} catch (const jsi::JSIException& e) {
  // Fallback for any other JSI error
}
```

Uncaught C++ exceptions thrown from a `HostFunction` are automatically caught by the JSI runtime and rethrown as a JS `Error` in the calling JS code. If the exception extends `std::exception`, the `Error`'s message is the return value of `what()`.
