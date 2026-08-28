# Migrating from v2 to v3

## Replace `fadeOutOnEnd` with `opacityAnimation`

v3 replaces the `fadeOutOnEnd` boolean with an opacity curve shared by the
Skia and WebGPU renderers.

v2:

```tsx
<Confetti fadeOutOnEnd />
<PIConfetti fadeOutOnEnd />
<CannonConfetti fadeOutOnEnd />
```

v3:

```tsx
<Confetti opacityAnimation={{ enabled: true }} />
<PIConfetti opacityAnimation={{ enabled: true }} />
<CannonConfetti opacityAnimation={{ enabled: true }} />
```

Setting `enabled: true` without keyframes uses the v3 default curve, which stays
fully opaque until 80% of the animation and then fades to zero. Omitting
`opacityAnimation`, or using `opacityAnimation={{ enabled: false }}`, keeps every
flake fully opaque. When `opacityAnimation` is provided, `enabled` is required.

Use `keyframes` for a custom curve:

```tsx
<Confetti
  opacityAnimation={{
    enabled: true,
    keyframes: {
      0: 0,
      0.15: 1,
      0.8: 1,
      1: 0,
    },
  }}
/>
```

`ContinuousConfetti` does not accept `opacityAnimation` because its animation
does not end.

## Cannon gravity

The default `CannonConfetti` gravity is now `2.5`, down from `3`, to preserve
the previous fall timing with the corrected aerodynamic drag model. Pass
`gravity={3}` to retain the v2 value.

## WebGPU renderer

The existing import continues to use the Skia renderer:

```tsx
import { Confetti } from 'react-native-fast-confetti';
```

WebGPU is opt-in through the new entry point and requires the WebGPU peers
listed in the README:

```tsx
import { Confetti } from 'react-native-fast-confetti/gpu';
```
