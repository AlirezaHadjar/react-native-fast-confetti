# WebGPU boxed-object lifetime investigation

## Decision

Keep the upstream `react-native-webgpu` ownership behavior unchanged.
`BoxedWebGPUObject` must retain a strong reference to its JSI `NativeState`.
The experimental weak-reference patch was removed because it changed transfer
semantics without proving that the box caused the observed memory usage.

## Upstream behavior

`react-native-webgpu` uses `BoxedWebGPUObject` to move native WebGPU objects
between the React JavaScript runtime and Worklets runtimes. A JSI `NativeState`
cannot be serialized directly, so the library places it in a serializable
`HostObject`. The destination runtime calls `unbox()` to create a local JSI
wrapper around the same native state.

The box stores a `std::shared_ptr<jsi::NativeState>`. This keeps the native GPU
object alive if the source runtime collects its wrapper before the destination
runtime has unboxed it. It also permits the serialized box to be unboxed again
later, even when no previously created wrapper remains alive.

The behavior was introduced as part of the NativeState architecture in
[react-native-webgpu PR #298](https://github.com/wcandillon/react-native-webgpu/pull/298)
and remains in the upstream implementation:
[NativeObject.h](https://github.com/wcandillon/react-native-webgpu/blob/main/packages/webgpu/cpp/jsi/NativeObject.h).

## Rejected change

The local experiment retained the native state strongly only until the first
successful `unbox()`, then replaced ownership with a weak reference. This could
release GPU resources sooner when Worklets retains the serialized box longer
than its destination wrapper.

That approach is unsafe as a general dependency patch. After the first unbox,
garbage collection of the source and destination wrappers could destroy the
native object while the serialized box is still valid. A later `unbox()` would
then fail, although upstream currently guarantees that it succeeds for the
lifetime of the box. The change therefore traded deterministic cross-runtime
ownership for an unverified memory optimization.

## What must be proven before revisiting

A future change should not alter ownership until profiling establishes all of
the following:

1. `BoxedWebGPUObject` instances outlive every legitimate wrapper because a
   Worklets serialization cache retains them.
2. Those boxes are the retaining path for material GPU allocations after
   canvas unmount, rather than allocator caching, driver memory, Dawn device
   caches, or another application reference.
3. The intended serialization contract does not require delayed or repeated
   unboxing.
4. Native lifecycle tests cover source-runtime collection before the first
   unbox, repeated unboxing, destination-runtime destruction, remounting, hot
   reload, and concurrent runtimes.

Until that evidence exists, the strong reference is the correct conservative
ownership model. Memory work should focus on releasing application-owned
buffers, textures, pipelines, canvases, and devices at their actual lifecycle
boundaries and verifying the native retaining graph with platform profilers.
