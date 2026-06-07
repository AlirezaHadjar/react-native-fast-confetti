# WebGPU And Native Renderer Findings

This document records the implementation findings from comparing Skia,
React Native WebGPU, and TypeGPU.

## Summary

WebGPU is not automatically smoother than Skia for normal 2D confetti counts.
For a few hundred particles, Skia can still look smoother because it is already
very close to the ideal workload: batched 2D sprite transforms on a canvas.

WebGPU becomes valuable when the particle count or simulation complexity is high
enough to justify GPU setup, GPU buffers, command encoding, and presentation
cost. In testing, WebGPU handled very high particle counts that Skia could not,
but the original WebGPU renderer looked less smooth at normal counts because it
was doing much more work than the visual result required.

## What Was Fixed

The first major issue was frame scheduling. The original WebGPU renderer used a
JS `requestAnimationFrame` style loop and TypeGPU wrapper calls every frame. That
introduced pacing issues.

The optimized path now uses Reanimated `useFrameCallback` and raw WebGPU command
submission:

```text
useFrameCallback
-> queue.writeBuffer(uniforms)
-> begin compute/render pass
-> set raw pipeline and bind groups
-> dispatch/draw
-> queue.submit
-> context.present
```

This made the WebGPU version much smoother.

The second major issue was shader/render cost. The original falling renderer used
`TESS = 6`, which means each flake rendered as 216 vertices. At 400 particles
that is about 86,400 vertices per frame. The optimized renderer uses `TESS = 1`,
so each flake is one quad, or 6 vertices. At 400 particles that is about 2,400
vertices per frame.

The default shader path also now avoids some unnecessary work:

- Wind force is skipped when wind strength is zero.
- Magnus force is skipped when Magnus strength is zero.
- Texture sampling is skipped for non-textured flakes.
- The texture branch uses `textureSampleLevel(..., 0)` so it remains valid in
  non-uniform fragment control flow.

## Why Skia Can Still Look Smoother

For 400 simple 2D flakes, Skia is a very good fit. It is effectively doing a
lean 2D batch/atlas workload.

The WebGPU path still has more moving parts:

- GPU device and canvas context management.
- Uniform writes.
- Compute pass for simulation.
- Render pass command encoding.
- Manual presentation.
- Shader complexity for 3D-ish motion, depth, textures, and materials.

WebGPU can scale further, but for small or medium 2D particle counts it can lose
to a highly optimized 2D renderer if the WebGPU pipeline is not extremely lean.

## Native Clock Alone Is Not Enough

A native `CADisplayLink` or Android `Choreographer` clock can improve pacing, but
it is not a complete fix if the rest of the renderer is still JS/TypeGPU-owned.

The wrong architecture would be:

```text
native clock
-> call JS every frame
-> JS/TypeGPU encodes WebGPU frame
```

That still crosses runtime boundaries every frame and can preserve or introduce
jitter.

The clock only becomes truly useful when the render loop and GPU command
submission also live on the native/render side.

## God-Tier Architecture

The maximum smoothness and scale architecture is a native renderer view:

```text
React Native JS
-> declarative props / imperative commands
-> native confetti view
-> native vsync clock
-> native GPU renderer
-> present
```

For iOS:

```text
UIView / CAMetalLayer
+ CADisplayLink
+ Metal
+ GPU buffers
+ instanced rendering
```

For Android:

```text
View / SurfaceView / TextureView
+ Choreographer
+ Vulkan or OpenGL ES
+ GPU buffers
+ instanced rendering
```

JS should only send configuration and commands:

```ts
confettiRef.current.start();
confettiRef.current.stop();
confettiRef.current.restart(config);
confettiRef.current.setGravity(...);
confettiRef.current.setCount(...);
confettiRef.current.setColors(...);
```

Native should own:

- Frame clock.
- Particle buffers.
- Simulation.
- Render pipeline.
- Texture atlas or texture array.
- GPU command submission.
- Presentation.
- Resource lifecycle.

## What The Native Renderer Could Support

A native Metal/Vulkan renderer can support the same kind of GPU work as WebGPU,
and with more direct control:

- 3D particle transforms.
- Perspective camera/depth.
- Lighting and normals.
- Texture arrays or atlases.
- Procedural materials.
- Compute-based particle simulation.
- Motion blur.
- Signed-distance masks.
- Post-processing.
- GPU buffer updates.
- Instanced rendering.
- GPU-driven spawning/recycling.
- Depth sorting or approximate transparency strategies.

On iOS, the ideal frame looks like:

```text
CADisplayLink
-> update uniforms
-> optional compute kernel updates particle buffer
-> render encoder draws instanced quads or meshes
-> optional post-process pass
-> present drawable
```

## Recommended Native Design

For this library, the practical high-end design would be:

```text
JS API
-> Fabric/Nitro native view wrapper
-> shared particle engine
-> Metal backend on iOS
-> Vulkan/OpenGL ES backend on Android
```

Nitro can be useful for the API/control surface, but the renderer itself should
be native. A Nitro module that only emits frame ticks into JS is not enough.

## Best Rendering Model

For normal confetti:

- Use one quad per particle.
- Use instanced rendering.
- Keep particle state in GPU buffers.
- Use a texture atlas or texture array.
- Use analytic motion when possible.
- Use fixed-step simulation when real physics is needed.
- Avoid per-frame JS work.
- Avoid variable-delta physics when smoothness matters.

For falling confetti, analytic motion is especially attractive:

```text
position = f(spawnTime, currentTime, spawnParams)
rotation = f(spawnTime, currentTime, spinParams)
```

That avoids accumulated variable-delta integration jitter.

For more complex physics, use a fixed timestep:

```text
accumulator += frameDelta
while accumulator >= fixedStep:
  simulate(fixedStep)
  accumulator -= fixedStep
render(interpolatedState)
```

## Practical Conclusion

- Skia is still the best fit for a few hundred simple 2D flakes when smoothness
  is the only goal.
- WebGPU is useful when count or simulation complexity increases.
- React Native WebGPU can be made much smoother by using the UI frame callback
  and raw WebGPU submission.
- The maximum smooth and scalable implementation is a native GPU renderer view,
  not a JS-driven WebGPU renderer with a native clock bolted on.
