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
  cannonsPositions={[{ x: 0, y: 300 }, { x: 400, y: 300 }]}
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
<PIConfetti
  count={200}
  blastPosition={{ x: 200, y: 150 }}
>
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

| v1 prop | v2 equivalent |
| --- | --- |
| `isInfinite` | `infinite` |
| `flakeSize` | `<*.Flake width={w} height={h} />` children |
| `sizeVariation` | Use multiple `<*.Flake>` children with different sizes |
| `radiusRange` | Set `radius` on individual `<*.Flake>` children |
| `fallDuration` | Computed automatically from `gravity` |
| `blastDuration` | `sprayDuration` on `CannonConfetti` |
| `blastRadius` | `spread` + `initialSpeed` on `PIConfetti` |
| `cannonsPositions` | `<CannonConfetti.Origin position={...}>` children |
| `autoStartDelay` | Removed |
| `randomSpeed` | `speedVariation` (on PIConfetti / CannonConfetti) |
| `randomOffset` | Removed (handled by physics) |
| `easing` / `fallEasing` | Removed (physics-based timing) |
| `type` / `flakeImage` / `flakeSvg` | `image` or `svg` prop directly |
