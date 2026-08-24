# ADR 0003: Own burst time and opacity in the GPU frame

- Status: Accepted
- Date: 2026-08-24

## Context

PI and Cannon previously used a Reanimated timing animation as an external
progress clock. The WebGPU frame callback read that progress, converted it back
to simulation time, and submitted the GPU work. Infinite cycles crossed back
to React to change a seed, rebuilt initialization state, and then crossed back
to the GPU.

The same progress also produced one opacity value for the entire canvas. With a
staggered launch, early and late particles therefore entered every opacity
keyframe together instead of according to their own age.

## Decision

The dedicated WebGPU frame callback is the sole burst clock. It derives elapsed
cycle time from its frame timestamp, applies the public easing function, writes
the bounded fixed-step schedule, and handles pause, reset, resume, finite
completion, and infinite boundaries. Reanimated shared values remain only as
cross-runtime control signals; no Reanimated timing or derived-opacity graph
drives PI or Cannon.

An infinite boundary increments a generation in the existing initialization
uniform and encodes initialization, simulation, and rendering into one command
buffer. It does not update React state, rebuild host particle data, or add a
second queue submission.

Resolved opacity keyframes are uploaded once to a read-only storage buffer.
The transform compute shader evaluates the curve from each particle's elapsed
time since launch relative to its remaining cycle duration. Earlier particles
therefore fade earlier while every particle still reaches the final keyframe at
the cycle end.

Alpha is quantized to eight bits and packed into the high byte of the existing
32-bit color-index field. The compact transform remains 32 bytes per particle.
The render vertex multiplies this particle alpha by the lifecycle visibility
scalar.

## Consequences

The active burst path has one authoritative clock, no parallel animation graph,
no per-cycle React render, no per-particle CPU work, and no per-frame keyframe
upload. It retains one queue submission per active frame.

When opacity animation is disabled, the compute shader takes one uniform branch
and returns full opacity. When enabled, each particle performs a binary search
over the shared keyframes plus one linear interpolation. For the usual two to
four points, this is one or two read-only comparisons and is small beside the
existing 3D integration, quaternion, and projection work. Keyframe memory is
eight bytes per point and particle memory is unchanged.

The Skia renderer retains its existing global opacity behavior. Matching the
WebGPU particle-local curve requires a separately profiled Skia implementation;
the public API remains compatible, but the timing detail is intentionally a
WebGPU feature for now.

## Validation evidence

A Release build ran the normal 450-particle infinite Cannon example on an
iPhone 17 Pro Simulator. Ten-second, 1 ms process samples measured:

| Configuration        | Main samples | Frame path | Presentation wait | Non-presentation frame work | Footprint |
| -------------------- | -----------: | ---------: | ----------------: | --------------------------: | --------: |
| No opacity curve     |        7,155 | 458 (6.4%) |       276 (3.9%) |                182 (2.54%) |  201.0 MB |
| Per-particle curve   |        7,758 | 567 (7.3%) |       328 (4.2%) |                239 (3.08%) |  193.2 MB |

The 0.54 percentage-point difference in non-presentation samples is inside the
observed run-to-run variance. This supports the architectural claim that the
curve adds no CPU-scaled particle work; it is not a GPU-time percentage. The
extra binary search executes in the existing compute pass.

Xcode 26.6 also recorded the opacity-disabled Time Profiler run, but its
simulator trace could not be exported (`Document Missing Template Error`). That
trace is retained as supporting raw data and excluded from numeric claims.
Repository TypeScript, ESLint, declaration/module builds, all 84 tests, and
actual TypeGPU-to-WGSL resolution pass.

## Alternatives rejected

### Keep Reanimated as the burst clock

Rejected because it creates two scheduling systems for one animation and makes
infinite GPU generations depend on React state synchronization.

### Upload one opacity per particle every frame

Rejected because it makes CPU work and transfer bandwidth scale with count.

### Add a separate opacity compute pass or persistent alpha field

Rejected because opacity can be resolved in the existing transform pass and
packed into the existing 32-byte output without another pass or particle byte.
