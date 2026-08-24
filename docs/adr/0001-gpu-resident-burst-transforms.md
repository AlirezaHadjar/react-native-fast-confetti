# ADR 0001: Use GPU-resident transforms for burst confetti

- Status: Accepted
- Date: 2026-08-24

## Context

PI and Cannon confetti use an analytic simulation. Their previous WebGPU vertex
shader recalculated the same trajectory, floor response, rotation, flip, and
appearance scale for every vertex of a particle. A six-vertex quad therefore
evaluated identical per-particle physics six times per frame.

Moving this work to JavaScript or native platform code would add per-frame data
transfer or require separate Metal and Android implementations. Keeping it in
the vertex shader avoids another GPU pass, but scales expensive transcendental
work with both particle count and vertices per particle.

## Decision

Resolve each PI or Cannon particle's render transform in a compute pass once per
frame, then render from that GPU-resident result.

The compute pass writes one compact 32-byte record per particle containing:

- screen-space center and two projected basis axes;
- packed palette index and opacity;
- shape and texture flags.

The vertex stage reads only this record and expands four corners. All confetti
quads use four-vertex triangle strips instead of six-vertex triangle lists. The
burst compute and render passes are encoded into the same command buffer and use
one queue submission, so the decision adds no JavaScript/native round trip.

Reanimated shared values provide lifecycle control signals only. The dedicated
WebGPU frame callback owns burst timing, and no JavaScript or worklet calculates
or transfers per-particle transforms.

## Consequences

At 20,000 standard particles, vertex invocations fall from 120,000 to 80,000
per frame. In the Cannon pressure scenario with 60,000 particles, full analytic
physics evaluations fall from 360,000 to 60,000 per frame, followed by 240,000
lightweight corner expansions.

The burst path adds one compute pass and 32 bytes of GPU memory per particle.
That is approximately 14.4 KB for the normal three-origin Cannon example with
450 particles and 1.92 MB for its 60,000-particle pressure configuration. The
buffer is allocated with the renderer's other resources and destroyed with
them.

Xcode Time Profiler recordings on a Release iOS Simulator build showed no
defensible CPU regression. Standard-path baseline and optimized samples
overlapped. Cannon samples were highly variable: the archived baseline ranged
from 1.27 to 2.28 seconds of sampled CPU per 20-second recording, optimized runs
ranged from 1.40 to 1.75 seconds, and the final compact-record run measured 1.34
seconds. These traces validate that command submission did not become a stable
new bottleneck, but they are not GPU timings and must not be presented as an
exact percentage speedup.

The deterministic workload reductions above are the basis for the decision.
Device-level GPU timestamp queries or a physical-device Metal trace are required
before claiming a measured GPU-time improvement.

## Alternatives considered

### Keep analytic physics in the vertex shader

This avoids the transform buffer and compute pass, but repeats identical
per-particle work four times even after adopting triangle strips. It scales
poorly at the particle counts where WebGPU matters most.

### Calculate transforms in JavaScript or on the React Native UI thread

Rejected because it would create per-frame CPU work and CPU-to-GPU transfer
proportional to particle count, recreating the bottleneck WebGPU is intended to
remove.

### Implement separate Metal and Android renderers

Rejected because WebGPU already maps the compute and render workload to native
GPU APIs. Platform-specific implementations would duplicate the simulation and
resource-lifecycle code without addressing a limitation demonstrated in the
WebGPU path.

### Keep six-vertex triangle-list quads

Rejected because a four-vertex triangle strip represents the same quad with
fewer vertex invocations and requires no index buffer.
