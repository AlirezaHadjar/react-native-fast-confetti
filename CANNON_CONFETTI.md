# CannonConfetti: From Interpolation to Physics

## Original Approach

The original cannon/blast confetti was handled inside the existing `Confetti` component. It used a **two-phase interpolation** strategy with a single `progress` shared value ranging from 0 to 2:

- **Phase 1 — Blast (0 to 1):** Each piece interpolated from its cannon position to a pre-computed target position on a grid above the screen. A per-piece `blastThreshold` (random value 0–0.9) staggered the start, so pieces didn't all move at once.
- **Phase 2 — Fall (1 to 2):** Standard falling animation. Pieces drifted downward using the same logic as regular confetti (vertical movement + horizontal oscillation via `randomXs` arrays).

### Problems

1. **Jarring transition at progress = 1.** Pieces reached their target position and suddenly stopped before the fall phase kicked in. There was no velocity continuity between the two phases — a piece moving upward at full speed would instantly switch to drifting downward.

2. **No physics.** The blast was a pure point-to-point interpolation. Pieces moved in straight lines from cannon to target with easing applied uniformly. There was no gravity (pieces didn't arc), no air resistance (horizontal velocity didn't decay), and no natural deceleration.

3. **Cannon code tangled with fall code.** The `Confetti` component had branching logic (`if (progress < 1 && hasCannons)`) in the RSXform worklet, cannon-related shared values (`dynamicCannonsPositions`, `aHasCannon`), and discriminated union types for easing props. This complexity affected every confetti mode, not just cannons.

## New Approach

A dedicated `CannonConfetti` component with a **physics-based animation model**. Cannon-specific code was fully removed from the `Confetti` component.

### Physics Model

Each piece launches from a cannon with an initial velocity. A single `progress` shared value (0 to 1) acts as normalized time. Physics equations compute position directly in the RSXform worklet — no extra animation drivers needed.

**Vertical motion (gravity):**

```
y(t) = cannonY + vy * t + 0.5 * gravity * t^2
```

Pieces decelerate going up, reach an apex, then accelerate downward. No jarring transition — gravity creates a smooth arc.

**Horizontal motion (air resistance/drag):**

```
x(t) = cannonX + (vx / drag) * (1 - e^(-drag * t))
```

Horizontal velocity decays exponentially. Pieces shooting left/right gradually slow down and settle, rather than moving at constant speed or stopping abruptly.

**Initial velocity from cannon direction:**

```
baseAngle = atan2(targetY - cannonY, targetX - cannonX)   // auto-aimed at screen center-top
angle = baseAngle + piece.randomAngleOffset
speed = initialSpeed * piece.speedMultiplier * piece.depthScale
vx = speed * cos(angle)
vy = speed * sin(angle)
```

Each cannon auto-aims toward the center-top of the screen. Per-piece random angle offsets spread pieces within a cone (`spreadAngle` prop).

### Why One Shared Value Works

`progress` is the only animation driver, driven with `Easing.linear` (physics handles acceleration, not the easing function). Each piece stores its own `vx`, `vy` (derived from pre-generated random angle + speed) in the boxes array. Position at any frame is a pure function of `(progress, vx, vy, gravity, drag, cannonPos)`.

### Screen-Size Normalization

All physics constants (`gravity`, `initialSpeed`, `drag`) are internally scaled relative to `containerHeight`. A gravity of `3.0` means `3.0 * containerHeight` pixels/s^2. This ensures the animation looks proportionally the same on any device.

## What Changed

### Added

- **`src/CannonConfetti.tsx`** — New component with physics simulation, imperative API (`pause`, `resume`, `restart`, `reset`).
- **`CannonConfettiProps`** — Physics props: `gravity`, `drag`, `initialSpeed`, `spreadAngle`, `speedVariation`, `depth`, `duration`, plus standard visual props.
- **`generateCannonBoxesArray()`** in `src/utils.ts` — Generates per-piece random properties: `cannonIndex` (round-robin), `angleOffset`, `speedMultiplier`, `launchDelay`, `depthScale`.
- **`depth` prop** — Simulates 3D perspective. Per-piece `depthScale` multiplies both visual scale (larger = closer) and speed (closer pieces move faster), creating a parallax effect.

### Removed from `Confetti`

- `cannonsPositions` prop and `dynamicCannonsPositions` shared value
- Blast phase (progress 0 to 1) from `runAnimation`
- Blast interpolation branch in `useRSXformBuffer`
- `blastDuration`, `blastTarget`, `blastThreshold` references
- `calculateHasCannons` and `calculateInitialProgress` utilities
- Cannon-related easing discriminated union types (`EasingPropsWithCannons` / `EasingPropsWithoutCannons`)

The `Confetti` component now only handles falling confetti. Its progress always starts at 1 (fall-only, range 1 to 2).

## Key Design Decisions

**Tight defaults for cohesive bursts.** Early iterations with wide spread angles (`PI/2`) and large speed variation (`0.5–1.5x`) looked chaotic — each piece went in a completely different direction. The defaults were tightened:
- Spread angle: `PI/5` (36 degrees) — pieces launch in a narrow cone
- Speed variation: `0.8–1.2x` — pieces travel at similar speeds during the burst
- Launch delay: `0–20%` of duration — pieces stagger out over time rather than all firing at once

The physics naturally handles divergence over time: as drag slows horizontal motion and gravity pulls pieces down, small initial differences compound. The cohesion is at launch; the variation emerges during flight.

**Depth as a scale + speed multiplier.** The `depth` prop (`Range`) assigns each piece a random `depthScale`. This multiplies both the visual transform scale and the launch speed. Larger pieces appear closer to the camera and move faster (parallax). Default is `{ min: 1, max: 1.2 }` for a subtle effect.
