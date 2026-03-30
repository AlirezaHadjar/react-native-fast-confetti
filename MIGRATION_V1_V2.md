# Migrating from v1 to v2

## `<Confetti />`

v1:

```tsx
<Confetti
  count={200}
  flakeSize={{ width: 8, height: 16 }}
  autoplay
  isInfinite
  colors={['#FF5733', '#33FF57']}
  fadeOutOnEnd
/>
```

v2:

```tsx
<Confetti
  count={200}
  autoplay
  infinite
  colors={['#FF5733', '#33FF57']}
  fadeOutOnEnd
>
  <Confetti.Flake width={8} height={16} />
</Confetti>
```

## `<Confetti />` with cannons → `<CannonConfetti />`

v1:

```tsx
<Confetti
  cannonsPositions={[
    { x: 0, y: 300 },
    { x: 400, y: 300 },
  ]}
  blastDuration={300}
/>
```

v2:

```tsx
<CannonConfetti autoplay>
  <CannonConfetti.Origin position={{ x: 0, y: 300 }}>
    <CannonConfetti.Flake size={12} />
  </CannonConfetti.Origin>
  <CannonConfetti.Origin position={{ x: 400, y: 300 }}>
    <CannonConfetti.Flake size={12} />
  </CannonConfetti.Origin>
</CannonConfetti>
```

## `<PIConfetti />`

v1:

```tsx
<PIConfetti
  count={200}
  flakeSize={{ width: 8, height: 16 }}
  blastPosition={{ x: 200, y: 150 }}
  blastRadius={180}
/>
```

v2:

```tsx
<PIConfetti count={200} blastPosition={{ x: 200, y: 150 }}>
  <PIConfetti.Flake width={8} height={16} />
</PIConfetti>
```

## `<ContinuousConfetti />`

v1:

```tsx
<ContinuousConfetti
  count={200}
  flakeSize={{ width: 8, height: 16 }}
  verticalSpacing={200}
/>
```

v2:

```tsx
<ContinuousConfetti autoplay>
  <ContinuousConfetti.Flake width={8} height={16} />
</ContinuousConfetti>
```

## Custom textures

v1:

```tsx
<Confetti type="image" flakeImage={image} />
<Confetti type="svg" flakeSvg={svg} />
```

v2:

```tsx
<Confetti image={image}>
  <Confetti.Flake size={50} />
</Confetti>

<Confetti svg={svg}>
  <Confetti.Flake size={30} />
</Confetti>
```

## Removed props

| v1 prop                            | v2 equivalent                                          |
| ---------------------------------- | ------------------------------------------------------ |
| `isInfinite`                       | `infinite`                                             |
| `flakeSize`                        | `<*.Flake width={w} height={h} />` children            |
| `sizeVariation`                    | Use multiple `<*.Flake>` children with different sizes |
| `radiusRange`                      | Set `radius` on individual `<*.Flake>` children        |
| `fallDuration`                     | Computed automatically from `gravity`                  |
| `blastDuration`                    | `sprayDuration` on `CannonConfetti`                    |
| `blastRadius`                      | `spread` + `initialSpeed` on `PIConfetti`              |
| `cannonsPositions`                 | `<CannonConfetti.Origin position={...}>` children      |
| `randomSpeed`                      | `speedVariation` (on PIConfetti / CannonConfetti)      |
| `randomOffset`                     | Removed (handled by physics)                           |
| `easing` / `fallEasing`            | Removed (physics-based timing)                         |
| `type` / `flakeImage` / `flakeSvg` | `image` or `svg` prop directly                         |

## New v2 props

| Prop            | Components                       | Description                                                                                           |
| --------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `gravity`       | All                              | Gravity constant (normalized to container height). Replaces `fallDuration`.                           |
| `flutter`       | `Confetti`, `ContinuousConfetti` | Controls how much confetti tumble affects trajectory (horizontal drift and vertical bobbing).         |
| `drift`         | `Confetti`, `ContinuousConfetti` | Controls horizontal displacement (0 = straight down, 1 = full physics).                               |
| `depth`         | All                              | Per-piece depth scale range to simulate 3D perspective.                                               |
| `tumbleClamp`   | All                              | Minimum scale when a piece is edge-on during tumble. Use higher values (e.g. 0.9) for image textures. |
| `initialScale`  | All                              | The scale particles start at before animating to full size.                                           |
| `flakeStyle`    | All                              | Visual style of default flakes: `'solid'` or `'glossy'` (adds a gradient highlight).                  |
| `sprayDuration` | `PIConfetti`, `CannonConfetti`   | Duration in milliseconds over which confetti pieces are staggered at launch.                          |
