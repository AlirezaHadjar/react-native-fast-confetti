# Debugging and Pitfalls

---

## Reading a Native Crash Trace

A tombstone (Android) or crash report (iOS) has three parts worth reading: the signal line, the crashing thread's backtrace, and the other threads' backtraces.

**Signal line**

```
signal 11 (SIGSEGV), code 1 (SEGV_MAPERR), fault addr 0x7b1a4fe000
```

| Field | Meaning |
|---|---|
| `SIGSEGV` (signal 11) | Memory access violation — process accessed memory it doesn't own |
| `SIGABRT` (signal 6) | Deliberate abort — assertion failure, `std::terminate`, `__assert2` |
| `SEGV_MAPERR` | Address is not mapped — points to freed or never-allocated memory |
| `SEGV_ACCERR` | Address is mapped but the access mode is wrong (e.g., write to read-only) |
| fault addr near `0x0` | Null pointer dereference |
| fault addr non-null, high | Use-after-free (the address was once valid, then freed) |

**Backtrace reading order**

Read bottom-up. The bottom frame is where the thread started (e.g., `__pthread_start`). The top frame is where execution faulted.

```
#00 pc 0x00004a8c4  libc.so (memcpy+180)          ← faulted here
#01 pc 0x000018f30  libaudio.so (TxRingBuffer::push+160)
#02 pc 0x00001c244  libaudio.so (CaptureEncoderThread::processFrame+308)
#03 pc 0x00001bc80  libaudio.so (CaptureEncoderThread::run+192)
#04 pc 0x0000b7e48  libc.so (__pthread_start+208)  ← thread entry
```

**Thread names**

The thread name tells you which domain crashed:

| Thread name | Domain |
|---|---|
| `mqt_js` | JS thread (React Native's message queue thread) |
| `mqt_native_modules` | Legacy bridge thread (rare on New Architecture) |
| `main` (iOS) / app name e.g. `com.myapp` (Android) | Main/UI thread |
| Any other name | A background thread you (or a library) created |

If `mqt_js` is the crashing thread, the JS thread is involved — look for GC finalization, HostObject destruction, or a JSI call made from the wrong thread. If a background thread is the crashing thread, look for ownership bugs: a raw pointer to memory that the JS thread's GC freed.

---

## Symbolication

Production builds strip debug symbols from the shipped binary. Without symbols, frames show only hex offsets (`pc 0x000018f30`). Symbolication maps those offsets back to source file and line number.

**Prerequisite: archive unstripped binaries.** Symbolication requires the exact unstripped `.so` (Android) or `.dSYM` bundle (iOS) from the build that crashed. If you ship a release build without archiving symbols, `addr2line` and `atos` return `??:0`.

### Demangling C++ symbols with `c++filt`

C++ compilers mangle function names to encode namespaces, argument types, and templates. If you see a mangled symbol in a trace, pipe it through `c++filt` (ships with the Android NDK and Xcode):

```bash
$ c++filt _ZN5audio12TxRingBuffer4pushEPKhml
audio::TxRingBuffer::push(unsigned char const*, unsigned long, long)
```

Android's `debuggerd` demangles automatically when symbols are present. Mangled names appear when you pull a raw tombstone without symbols loaded.

### Android: `llvm-addr2line`

Maps a program counter offset to a source file and line number:

```bash
$ $ANDROID_NDK/toolchains/llvm/prebuilt/darwin-x86_64/bin/llvm-addr2line \
    -e app/build/intermediates/merged_native_libs/debug/out/lib/arm64-v8a/libaudio.so \
    -f 0x000018f30
audio::TxRingBuffer::push(unsigned char const*, unsigned long, long)
/Users/dev/audio-app/cpp/TxRingBuffer.cpp:47
```

The `-f` flag also emits the function name alongside the file/line.

### Android: `ndk-stack`

Automates full-tombstone symbolication directly from logcat:

```bash
$ adb logcat | ndk-stack \
    -sym app/build/intermediates/merged_native_libs/debug/out/lib/arm64-v8a/
```

`ndk-stack` scans logcat for tombstone output, finds the matching `.so` by name in the symbol directory, and rewrites every frame with file names and line numbers. Use this as your first step when a native crash appears during development or on a connected device.

### iOS: `atos`

Maps addresses in a `.dSYM` bundle to source locations:

```bash
$ atos -o AudioModule.framework.dSYM/Contents/Resources/DWARF/AudioModule \
    -arch arm64 \
    -l 0x100000000 \
    0x000018f30
```

`-l` is the load address of the binary in the crashed process (found in the crash report's "Binary Images" section). The offset in the backtrace is relative to this base.

---

## Common JSI Crash Patterns

### Use-after-free: GC destroys HostObject while background thread holds a raw pointer

**Signature in the trace**

- Signal: `SIGSEGV`, `SEGV_MAPERR`, non-null fault address
- Crashing thread: a background thread you own (audio, network, database encoder, etc.)
- Top frames: `memcpy`, `memset`, or a write into a buffer
- Simultaneous `mqt_js` thread: frames showing `Hades::collectOG`, `finalizeUnreachableObjects`, `shared_ptr::~shared_ptr`, `HostObject::~HostObject`, `~SomeBuffer` — the destructor cascade

**What happened.** The JS thread's GC found the HostObject unreachable from JS, triggered finalization, and destroyed the HostObject's owned resources. Concurrently, a background thread held a raw pointer into those resources and kept writing.

**Fix.** Either co-own with `shared_ptr` (background thread keeps the resource alive past GC collection) or coordinate shutdown (`join()` the thread in the HostObject destructor before members are destroyed).

```cpp
// Co-ownership fix: encoder holds its own shared_ptr to the buffer
class CaptureEncoderThread {
public:
    explicit CaptureEncoderThread(std::shared_ptr<TxRingBuffer> buf)
        : buf_(std::move(buf)) {}
private:
    std::shared_ptr<TxRingBuffer> buf_;  // survives HostObject destruction
};
```

```cpp
// Coordinated shutdown fix: destructor joins before members are freed
AudioPipelineHostObject::~AudioPipelineHostObject() {
    encoder_->stop();       // set running_ = false
    encoderThread_.join();  // wait — no more writes after this line
    // buf_ destroyed here, safely, after thread has exited
}
```

Prefer co-ownership when `join()` in the GC-triggered destructor would block the JS thread long enough to cause frame drops or ANR.

---

### Null dereference: HostObject or member not initialized before first JS call

**Signature in the trace**

- Signal: `SIGSEGV`, fault addr near `0x0` (typically `0x0` through `0x100`)
- Crashing thread: `mqt_js`
- Top frames: a HostObject method (`get`, `set`, or a named function) dereferencing a member pointer

**What happened.** `install()` ran before the C++ object was fully constructed, or the module was called before `install()` ran at all, leaving the global as `undefined`.

**Fix.** Ensure `install()` runs in `setBridge:` (iOS) or in the `OnLoad` JNI function (Android) — before the JS bundle evaluates. Guard against double-install with a `hasProperty` check.

```cpp
void install(jsi::Runtime& rt, std::shared_ptr<MyModule> module) {
    if (rt.global().hasProperty(rt, "MyModule")) return; // idempotent

    auto hostObject = std::make_shared<MyModuleHostObject>(std::move(module));
    rt.global().setProperty(rt, "MyModule",
        jsi::Object::createFromHostObject(rt, hostObject));
}
```

---

### JSI call from wrong thread: race with GC or engine internals

**Signature in the trace**

- Signal: `SIGABRT` or `SIGSEGV`
- Crashing thread: a background thread calling `jsi::Function::call`, `rt.global().setProperty`, or creating a `jsi::Value`
- Frames: deep inside `libhermes.so` or `libjsc.so` with no clear native-module frame between them

**What happened.** A background thread called into the JSI runtime directly. The runtime has no internal locking; concurrent access from two threads corrupts engine-internal state.

**Fix.** Dispatch back to the JS thread through `CallInvoker`:

```cpp
callInvoker_->invokeAsync([result = std::move(result),
                           callback = std::move(callback)](jsi::Runtime& rt) {
    callback->asObject(rt).asFunction(rt).call(rt, result);
});
```

Never call any method that takes `Runtime&` from a thread that doesn't own the runtime.

---

### Dangling `this` in lambda: HostObject destroyed before lambda runs

**Signature in the trace**

- Signal: `SIGSEGV`
- Crashing thread: `mqt_js` (inside a `CallInvoker` callback)
- Frames: a HostObject method body, but the HostObject has already been destroyed

**What happened.** A lambda captured `this` (raw pointer to the HostObject). The HostObject was GC'd between when the lambda was enqueued and when it ran.

**Fix.** Capture `shared_from_this()` instead of `this`. The HostObject must inherit from `std::enable_shared_from_this` and be managed by a `shared_ptr`.

```cpp
// DON'T
backgroundThread_.post([this]() {
    callInvoker_->invokeAsync([this](jsi::Runtime& rt) { /* use this */ });
});

// DO
auto self = shared_from_this();
backgroundThread_.post([self]() {
    self->callInvoker_->invokeAsync([self](jsi::Runtime& rt) { /* use self */ });
});
```

---

### GC-triggered destructor blocking the JS thread

Not a crash but a severe freeze or ANR. If `join()` is called in a HostObject destructor that the GC triggers, the JS thread blocks until the background thread exits. Audio threads, long-running encoders, or any thread that waits on I/O can hold this for hundreds of milliseconds.

**Diagnosis.** ANR trace (Android) or a hang report (iOS) shows `mqt_js` stuck in `AudioPipelineHostObject::~AudioPipelineHostObject` → `std::thread::join`.

**Fix.** Use co-ownership (`shared_ptr`) so the destructor doesn't need to join. Or signal early (in an explicit `release()` call from JS, not the destructor) so the thread has already exited before the GC runs.

---

## Address Sanitizer (ASan)

ASan instruments every heap allocation and deallocation at compile time. When a use-after-free, heap buffer overflow, or stack buffer overflow occurs, ASan terminates the process immediately and emits a structured report — before the bug manifests as a cryptic `SIGSEGV` at an unrelated callsite.

**Enable on Android (CMakeLists.txt)**

```cmake
if(CMAKE_BUILD_TYPE STREQUAL "Debug")
    target_compile_options(audio PRIVATE -fsanitize=address -fno-omit-frame-pointer)
    target_link_options(audio PRIVATE -fsanitize=address)
endif()
```

**Enable on iOS**

Xcode → Product → Scheme → Edit Scheme → Run → Diagnostics → Address Sanitizer ✓

**What an ASan report looks like**

```
ERROR: AddressSanitizer: heap-use-after-free on address 0x7b1a4fe000
  WRITE of size 160 at 0x7b1a4fe000 thread T3 (AudioEncoder)

  #0 memcpy
  #1 audio::TxRingBuffer::push(...)  TxRingBuffer.cpp:47

  previously freed by thread T1 (mqt_js):
  #0 operator delete
  #1 audio::TxRingBuffer::~TxRingBuffer()  TxRingBuffer.cpp:12
  #2 audio::AudioPipelineHostObject::~AudioPipelineHostObject()
```

ASan shows the write, the free, and both call stacks. Compare this to the production `SIGSEGV` at `memcpy+180` with no context — the information density difference is why you should run ASan in development and CI on every commit.

**Constraints.** ASan adds 2–3× memory overhead and 2–3× CPU overhead. Never ship with it enabled. Use it in debug builds and CI only.

---

## Pre-Ship Checklist

Run this before merging any native JSI module to production.

### Ownership

| Check | What to verify |
|---|---|
| Raw pointers to HostObject members | Every background thread that holds a raw pointer to a HostObject-owned resource also holds a `shared_ptr` to that resource, OR the HostObject destructor `join()`s the thread before members are destroyed |
| Lambda `this` captures | Lambdas that outlive the HostObject capture `shared_from_this()`, not `this` |
| `jsi::Value` in callbacks | Values captured in async callbacks are either moved into `shared_ptr<jsi::Value>` or their data is copied into plain C++ types before the callback is dispatched |
| Ref cycles | No `shared_ptr` cycle between a HostObject and a callback it owns — use `weak_ptr` to break the cycle |

### Threading

| Check | What to verify |
|---|---|
| JSI Runtime access | Every call that takes `Runtime&` happens on the JS thread or inside a `CallInvoker::invokeAsync` callback |
| JNI on background threads (Android) | Every thread that calls JNI has called `AttachCurrentThread` and detaches before exit |
| ObjC/JNI from real-time threads (iOS/Android) | No `@objc` message sends or JNI calls inside audio, MIDI, or other real-time callbacks |
| `jsi::Value` concurrent writes | No two threads assign, move, or destroy the same `jsi::Value` concurrently |

### Memory

| Check | What to verify |
|---|---|
| Every cross-boundary allocation | Exactly one system (GC heap or native heap) owns each allocation — no double-free risk |
| `ArrayBuffer` backing store | The `MutableBuffer` that backs any `ArrayBuffer` exposed to JS outlives all JS references to it |
| Large native allocations | Allocations invisible to the GC (large native buffers) don't prevent GC from collecting — consider calling `runtime.instrumentation().collectGarbage()` as a hint if memory pressure is observable |

### Platform

| Check | What to verify |
|---|---|
| Tested on both platforms | Functionality verified on a real iOS device (arm64) and a real Android device (arm64-v8a) |
| ABI filters | `CMakeLists.txt` `abiFilters` includes all target ABIs; no crash on 64-bit-only devices |
| Bitcode / dSYM archived | Unstripped `.so` files (Android) and `.dSYM` bundles (iOS) are archived alongside each release build |

### Lifecycle

| Check | What to verify |
|---|---|
| `install()` timing | `install()` runs before the JS bundle evaluates; the global is never `undefined` on first call |
| `install()` idempotency | A second `install()` call (fast refresh, bundle reload) does not leak globals or native objects |
| Destructor safety | HostObject destructor does not block the JS thread; background threads are signalled and co-ownership via `shared_ptr` handles the actual deallocation |
| App-lifecycle coordination | Any resource the module owns (file handles, audio sessions, sockets) is released when the app backgrounds or the module is torn down — not only at GC collection time |
