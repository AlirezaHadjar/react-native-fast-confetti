# Confetti Physics — Two Approaches

This document describes two approaches for realistic confetti animation physics: a **full ODE-based simulation** and an **enhanced analytical model**. The ODE approach was implemented in the `feat/v2` branch.

---

## Table of Contents

- [Approach 1: ODE-Based Physics (Implemented)](#approach-1-ode-based-physics-implemented)
- [Approach 2: Enhanced Analytical Model (Alternative)](#approach-2-enhanced-analytical-model-alternative)
- [Comparison](#comparison)
- [Physics Research Summary](#physics-research-summary)
- [References](#references)

---

## Approach 1: ODE-Based Physics (Implemented)

### Problem

The original confetti rotation model uses decoupled sinusoidal functions: a slow spin + oscillating bank for `rz`, and a separate tumble angle for scale. These are independent functions of time that don't interact, producing unnatural motion — pieces oscillate back and forth instead of rotating freely through 360°, and the relationship between rotation, drift, and narrowing feels artificial because it IS artificial.

Real falling plates have fundamentally coupled dynamics: the plate's angle determines the drag direction, which affects velocity, which affects the aerodynamic torque, which changes the angle. This feedback loop produces natural flutter, tumble, and chaotic behavior that cannot be captured by independent sinusoidal functions.

### Physics Model

Based on the Tanabe-Kaneko (1994) simplified falling plate model and the Kozlov body-frame formulation. The model tracks 6 state variables per piece: `(x, y, vx, vy, θ, ω)`.

#### Equations of Motion (lab frame)

```
// Decompose velocity into plate's body frame
v_n = -vx * sin(θ) + vy * cos(θ)    // velocity normal to plate chord
v_t =  vx * cos(θ) + vy * sin(θ)    // velocity along plate chord

// Aerodynamic forces (body frame, quadratic drag)
F_n = -C_n * v_n * |v_n|    // normal drag (large — plate resists broadside motion)
F_t = -C_t * v_t * |v_t|    // tangential drag (small — plate slices through edge-on)

// Transform forces to lab frame + gravity
ax = F_n * (-sin(θ)) + F_t * cos(θ)
ay = F_n *   cos(θ)  + F_t * sin(θ) + g    // +g because screen coords: +y is down

// Angular dynamics
dω/dt = C_couple * v_n * v_t    // added-mass torque (THE key coupling term)
       + tumbleBias              // constant torque ensuring continuous rotation
       - C_rot * ω * |ω|        // rotational drag (prevents infinite spin)
```

#### Why This Works

The term `C_couple * v_n * v_t` is the **added-mass torque** from the Kozlov model `((m_22 - m_11) * vx' * vy')`. When the plate moves obliquely through air, the asymmetry between normal and tangential added mass creates a torque. This single term is responsible for:

- **Flutter**: plate oscillates when coupling is moderate (angle reverses before completing full rotation)
- **Tumble**: plate rotates continuously when coupling or initial ω is large
- **Chaotic**: erratic flips near the flutter-tumble transition (Froude number ~0.67)
- **Lateral drift**: emerges automatically — tilted plate has asymmetric drag → horizontal force
- **Non-uniform tumble rate**: plate lingers broadside (high drag slows rotation) and zips through edge-on (low drag allows faster rotation)
- **Coupled vertical bobbing**: plate decelerates broadside (high drag), accelerates edge-on (low drag)

All of these behaviors are **emergent** from the physics, not manually crafted.

The `tumbleBias` is a constant torque added per piece to prevent settling at the edge-on equilibrium (θ=π/2), which is a stable fixed point of the pure coupling torque. In real life, vortex shedding and pressure fluctuations prevent this settling — the bias term is a proxy for those effects.

#### ODE Parameters (per piece, randomized)

| Parameter | Meaning | Maps to user prop | Default/Formula |
|-----------|---------|-------------------|-----------------|
| `C_n` | Normal drag coefficient | Derived from `gravity` | `4.0 / scaledGravity` |
| `C_t` | Tangential drag coefficient | Fixed ratio to C_n | `C_n * 0.25` |
| `C_couple` | Rotation-translation coupling | `flutter` prop | `flutter * 5 / scaledGravity` |
| `C_rot` | Rotational damping | Constant | `2.0` |
| `tumbleBias` | Constant driving torque | Derived from rotation range | `±tumbleRate² * C_rot` |
| `g` | Gravity | `gravity * containerHeight` | User's gravity prop scaled |

### Architecture

#### Pre-computation Strategy

1. At init (and on `refreshBoxes`), run RK4 integration for each piece in the worklet
2. Store N trajectory samples per piece as a flat `number[]` in a shared value
3. In `useRSXformBuffer`, interpolate between samples using `progress`

#### Performance Budget

- **200 pieces × 120 RK4 steps × 4 evaluations × ~15 ops** = ~1.4M operations
- Estimated wall time: **3–8ms** (acceptable for init + loop restart every ~8s)
- **Memory**: 200 × 121 × 3 floats = **72,600 numbers** ≈ 290KB in shared value
- **Per-frame cost**: 200 × (index lookup + 3 lerps + 2 trig) — cheaper than the analytical model

#### Data Layout

Flat interleaved array for cache-friendly worklet access:

```
trajectoryData[pieceIdx * (SAMPLES+1) * 3 + sampleIdx * 3 + 0] = x
trajectoryData[pieceIdx * (SAMPLES+1) * 3 + sampleIdx * 3 + 1] = y
trajectoryData[pieceIdx * (SAMPLES+1) * 3 + sampleIdx * 3 + 2] = θ
```

### RSXform Mapping

The ODE gives `(x, y, θ)`. RSXform needs `(rz, scale, tx, ty)`:

- **tx, ty** ← `x(t), y(t)` from ODE (position with natural physics-driven drift + flutter)
- **tx** is blended with spawn position via `drift` prop: `tx = spawnX + (rawTx - spawnX) * drift`
- **scale** ← `cos(θ(t)) * depthScale * appearScale` (edge-on narrowing from tumble angle)
- **rz** ← `spinPhase + spinRate * t` (continuous in-plane spin, separate from tumble)

**Why rz is separate from θ:** The ODE models rotation in one 2D plane (the plate's tilt). In 3D, confetti also spins around its normal axis (like a propeller). RSXform's rotation represents this in-plane spin. The tumble (out-of-plane flip) is simulated via scale modulation. These are two different physical rotation axes.

### Files Modified

| File | Change |
|------|--------|
| `src/physics.ts` | **NEW** — ODE solver (PlateState, PlateParams, derivatives, rk4Step, integrateTrajectory) |
| `src/utils.ts` | `generateFallingBoxesArray` returns `{boxes, trajectories}`, runs ODE per piece |
| `src/Confetti.tsx` | Added `trajectories` shared value, trajectory interpolation in RSXform callback |
| `src/constants.ts` | Added `TRAJECTORY_SAMPLE_COUNT`, `DEFAULT_TANGENTIAL_DRAG_RATIO`, `DEFAULT_ROTATIONAL_DAMPING`, `DEFAULT_CONFETTI_DRIFT` |
| `src/types.ts` | Added `drift?: number` prop to `ConfettiBaseProps` |

### Prop Mapping (existing props → ODE parameters)

| User prop | Current meaning | New meaning (ODE) |
|-----------|----------------|-------------------|
| `gravity` | Gravitational constant | Same — `g = gravity * containerHeight` |
| `flutter` | Sinusoidal flutter amplitude | Coupling strength range (`C_couple`) |
| `rotation.x` | Tumble rate range | Initial angular velocity range (`ω₀`) + tumbleBias magnitude |
| `rotation.z` | Spin rate range | Visual in-plane spin rate range (unchanged) |
| `depth` | Parallax depth scale | Final transform scale only (decoupled from ODE gravity) |
| `drift` | **NEW** — lateral displacement factor | 0 = fall straight, 1 = full physics drift. Default 0.5 |
| `verticalSpacing` | Grid row spacing | Same — affects spawn positions |

### Tuning Notes

Key parameter relationships discovered during implementation:

- **C_n = 4.0 / scaledGravity** — matches terminal velocity to reasonable fall speed
- **C_t = C_n × 0.25** — ratio of 4:1 (not 100:1 like real plates) to prevent bimodal fall speeds where edge-on pieces fall dramatically faster than broadside ones
- **C_couple = flutter × 5 / scaledGravity** — the most sensitive parameter. Controls coupling between translation and rotation
- **C_rot = 2.0** — prevents runaway spin while allowing visible tumble
- **tumbleBias = ±tumbleRate² × C_rot** — signed randomly per piece to prevent all-left or all-right drift. Magnitude ensures pieces maintain rotation against coupling torque
- **Initial vy randomization** — `getRandomValue(0, 0.15) * scaledGravity` breaks grid row structure that otherwise causes visible "waves"
- **Duration estimation** — uses angle-averaged drag `(Cn + Ct) × 4/(3π)` for accurate animation length

### What Does NOT Change

- Grid layout logic (columns, rows, jitter)
- CannonConfetti — completely separate physics model
- Texture/Atlas rendering — sprites, colors, sizes
- Animation lifecycle (restart, pause, resume, infinite, phaseOffset)
- fadeOutOnEnd, initialScale, containerStyle
- Public API types (no breaking changes except the new optional `drift` prop)

---

## Approach 2: Enhanced Analytical Model (Alternative)

This approach captures ~90% of the visual improvement of the ODE model while being simpler to implement and tune. It replaces the current sinusoidal model with physics-inspired analytical functions.

### Key Changes from Current Code

#### 1. Remove bank oscillation from rz entirely

```typescript
rz = spinPhase + spinRate * t    // pure continuous spin, no sin() overlay
```

Currently rz has a slow spin plus a sin()-based banking overlay that causes oscillation. Removing the overlay gives clean, continuous 360° rotation.

#### 2. Non-uniform tumble rate (physics-inspired perturbation)

```typescript
α(t) = tumbleRate * t + tumblePhase + nonUniformity * sin(2 * tumbleRate * t)
```

The `nonUniformity` parameter (0.1–0.3) makes the tumble speed up when edge-on (low drag) and slow down when broadside (high drag). This is a first-order perturbation theory solution to `θ'' = ε*sin(2θ) - damping*θ'`.

This captures the most visually important feature of real tumbling plates: they **linger** when broadside (large projected area = high drag) and **zip through** when edge-on (small projected area = low drag).

#### 3. 2× frequency vertical bob (from Belmonte 1998)

```typescript
ty = spawnY + baseY + flutterAmp * cos(2 * α(t))
```

Belmonte showed that vertical velocity oscillates at **twice** the tumble frequency because drag depends on sin²(α). The plate decelerates most at broadside, and broadside occurs twice per full rotation.

#### 4. Keep current gravity + exponential drag for base fall

The existing fall model (gravity + air resistance for terminal velocity) is already physically reasonable. No changes needed.

#### 5. Per-piece regime (randomly assigned)

- **Tumblers** (majority): α increases monotonically → full 360° tumble, continuous spin
- **Flutterers** (minority): α oscillates → piece rocks back and forth, gentle drift

In the real world, the Froude number determines which regime a plate falls in. Here we randomize it for visual variety.

### Implementation Sketch

```typescript
// Per piece (in generateFallingBoxesArray):
const isTumbler = Math.random() > 0.3; // 70% tumblers
const nonUniformity = getRandomValue(0.1, 0.3);

// In RSXform callback:
const tumbleAngle = isTumbler
  ? tumbleRate * t + tumblePhase + nonUniformity * Math.sin(2 * tumbleRate * t)
  : tumbleAmplitude * Math.sin(tumbleRate * t + tumblePhase); // flutter mode

const scale = Math.cos(tumbleAngle) * depthScale * appearScale;
const rz = spinPhase + spinRate * t; // clean continuous spin
const verticalBob = flutterAmp * Math.cos(2 * tumbleAngle);
```

### What This Fixes

- **Continuous rotation**: pieces rotate freely through 360° (main complaint with old model)
- **Non-uniform tumble**: "lingering broadside" effect matches physical observations
- **2× frequency bob**: vertical motion is physically motivated
- **Regime variety**: visual interest from mixed flutter/tumble behaviors

### What This Doesn't Capture

- **Coupled lateral drift**: still needs manual drift functions (doesn't emerge from physics)
- **Chaotic behavior**: cannot produce erratic flips near flutter-tumble transition
- **Feedback loops**: rotation doesn't affect trajectory and vice versa
- **Parameter sensitivity**: behaviors are manually assigned, not emergent

---

## Comparison

| Aspect | ODE-Based (Approach 1) | Enhanced Analytical (Approach 2) |
|--------|----------------------|--------------------------------|
| **Realism** | Excellent (~98%) | Good (~90%) |
| **Coupling** | Emergent (from physics) | Manual (sin/cos functions) |
| **Chaotic behavior** | Natural near Fr~0.67 | Cannot produce |
| **Lateral drift** | Emerges automatically | Must be manually added |
| **Non-uniform tumble** | Natural (from drag asymmetry) | Approximated via perturbation |
| **Performance (init)** | ~5ms for 200 pieces | Negligible |
| **Performance (per-frame)** | Cheaper (table lookup + lerp) | More expensive (multiple trig calls) |
| **Memory** | ~290KB for trajectory table | Negligible |
| **Tuning difficulty** | Hard (emergent behavior) | Easy (direct parameter control) |
| **Implementation complexity** | Medium | Low |
| **Visual quality** | Best — behaviors feel organic | Good — behaviors feel intentional |

### When to Choose Which

**Choose ODE (Approach 1)** when:
- Visual quality is the top priority
- The confetti is a central visual element (hero animations, celebrations)
- Device performance budget allows 5ms init + 290KB memory
- You want natural variety without manually crafting each behavior

**Choose Enhanced Analytical (Approach 2)** when:
- Simplicity and maintainability matter more than perfect realism
- Targeting very low-end devices where init cost matters
- You need precise control over each visual parameter
- The confetti is a background element where subtle physics differences don't matter

---

## Physics Research Summary

### Andersen-Pesavento-Wang (APW) Model

The most complete 2D model for falling plates in a fluid. Tracks position `(x, y)`, velocity `(vx, vy)`, angle `θ`, and angular velocity `ω`. Key insight: uses **added-mass coefficients** `(m_11, m_22)` that couple translational and rotational motion.

The added-mass tensor creates an effective torque proportional to `(m_22 - m_11) * v_n * v_t` — this is what makes plates flutter and tumble rather than falling straight down.

### Belmonte Flutter-Tumble Transition

Belmonte, Eisenberg & Moses (1998) experimentally characterized the transition between flutter (oscillating) and tumble (rotating) regimes as a function of the Froude number:

```
Fr = v_terminal / sqrt(g * L)
```

- **Fr < 0.67**: Flutter regime (oscillation without full rotation)
- **Fr ≈ 0.67**: Chaotic transition (unpredictable flipping)
- **Fr > 0.67**: Tumble regime (continuous rotation)

They also showed that vertical velocity oscillates at **2× the tumble frequency**, which we use in both approaches.

### Dimensionless Parameters

The key dimensionless numbers governing falling plate dynamics:

- **Froude number** `Fr`: ratio of inertial to gravitational forces. Controls flutter vs tumble.
- **Reynolds number** `Re`: ratio of inertial to viscous forces. For confetti (~1cm at ~1m/s), Re ≈ 700, well into the quadratic drag regime.
- **Density ratio** `ρ_plate / ρ_fluid`: for paper in air, ~1000:1. High density ratio favors tumbling.
- **Aspect ratio** `thickness / chord`: for confetti, ~0.01. Thin plates have stronger added-mass effects.

### Kozlov Body-Frame Formulation

Borisov, Kozlov & Mamaev reformulated the falling plate problem in the body frame, revealing the Hamiltonian structure. The key equation for angular dynamics:

```
I_eff * dω/dt = (m_22 - m_11) * v_n * v_t - C_rot * ω * |ω|
```

Where `I_eff` is the effective moment of inertia including fluid added mass, and `(m_22 - m_11)` is the added-mass asymmetry (large for thin plates).

---

## References

- **Andersen, Pesavento & Wang (2005)** — "Unsteady aerodynamics of fluttering and tumbling plates," J. Fluid Mech. 541
- **Belmonte, Eisenberg & Moses (1998)** — "From Flutter to Tumble," Phys. Rev. Lett. 81
- **Tanabe & Kaneko (1994)** — "Behavior of a Falling Paper," Phys. Rev. Lett. 73
- **Borisov, Kozlov & Mamaev (2015)** — "Plate falling in a fluid: Regular and chaotic dynamics"
