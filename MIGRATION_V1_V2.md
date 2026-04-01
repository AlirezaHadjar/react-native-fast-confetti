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
<PIConfetti>
  <PIConfetti.Origin blastPosition={{ x: 200, y: 150 }} count={200}>
    <PIConfetti.Flake width={8} height={16} />
  </PIConfetti.Origin>
</PIConfetti>
```

v2 with multiple blast positions:

```tsx
<PIConfetti>
  <PIConfetti.Origin blastPosition="center" count={100}>
    <PIConfetti.Flake size={12} />
  </PIConfetti.Origin>
  <PIConfetti.Origin blastPosition="bottom-left" count={100}>
    <PIConfetti.Flake size={12} />
  </PIConfetti.Origin>
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

v2 (parent-level — applies to all flakes):

```tsx
<Confetti image={image}>
  <Confetti.Flake size={50} />
</Confetti>
```

v2 (flake-level — per flake, overrides parent):

```tsx
<Confetti>
  <Confetti.Flake size={50} image={image} />
  <Confetti.Flake size={30} svg={svg} />
  <Confetti.Flake width={8} height={14} />
</Confetti>
```

## Removed props

| v1 prop                            | v2 equivalent                                                 |
| ---------------------------------- | ------------------------------------------------------------- |
| `isInfinite`                       | `infinite`                                                    |
| `flakeSize`                        | `<*.Flake width={w} height={h} />` children                  |
| `sizeVariation`                    | Use multiple `<*.Flake>` children with different sizes        |
| `radiusRange`                      | Set `radius` on individual `<*.Flake>` children               |
| `fallDuration`                     | Computed automatically from `gravity`                         |
| `blastDuration`                    | `sprayDuration` on `CannonConfetti`                           |
| `blastRadius`                      | `spread` + `initialSpeed` on `PIConfetti`                     |
| `cannonsPositions`                 | `<CannonConfetti.Origin position={...}>` children             |
| `randomSpeed`                      | `speedVariation` (on PIConfetti / CannonConfetti)             |
| `randomOffset`                     | Removed (handled by physics)                                  |
| `easing` / `fallEasing`            | `easing` prop (defaults to ease-in for Confetti, linear for others) |
| `type` / `flakeImage` / `flakeSvg` | `image` or `svg` on `<*.Flake>` children                           |
| `width` / `height`                 | Set via `containerStyle` (supports numeric, %, flex sizing)         |

## New v2 props

| Prop             | Components                       | Description                                                                                     |
| ---------------- | -------------------------------- | ----------------------------------------------------------------------------------------------- |
| `gravity`        | All                              | Gravity constant (normalized to container height). Replaces `fallDuration`.                     |
| `wobble`         | `Confetti`, `ContinuousConfetti` | Controls how much confetti tumble affects trajectory (horizontal drift and vertical bobbing).    |
| `drift`          | `Confetti`, `ContinuousConfetti` | Controls horizontal displacement (0 = straight down, 1 = full physics).                         |
| `depth`          | All                              | Per-piece depth scale range to simulate 3D perspective.                                         |
| `flipIntensity`  | All                              | How dramatically pieces flip during tumble (0-1). Lower values keep pieces flatter.             |
| `initialScale`   | All                              | The scale particles start at before animating to full size.                                     |
| `flakeStyle`     | All                              | Visual style of default flakes: `'solid'` or `'glossy'` (adds a gradient highlight).            |
| `sprayDuration`  | `PIConfetti`, `CannonConfetti`   | Duration in milliseconds over which confetti pieces are staggered at launch.                    |
| `easing`         | All                              | Custom easing for animation progress. Gentle ease-in for Confetti, linear for others.           |
| `drag`           | `PIConfetti`, `CannonConfetti`   | Air resistance. Number or `{ horizontal, vertical }` for separate axes.                         |
