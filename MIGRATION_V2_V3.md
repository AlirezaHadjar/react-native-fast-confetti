# Migrating from v2 to v3

## Upgrade Skia and WebGPU

This branch targets `react-native-skia` 3.4+ and `react-native-webgpu` 0.13.1+.
Replace `@shopify/react-native-skia` with `react-native-skia` in dependencies
and imports. Do not install both names: they provide the same native module.
Upgrade Skia and WebGPU together so their Dawn versions match.

Skia v3 uses Graphite and requires Android API 26 with Vulkan, or iOS 15.1+.
Expo Go does not include this native backend; rebuild your development client.
See the [Skia migration guide](https://wcandillon.github.io/react-native-skia/docs/getting-started/migration/).

## Upgrade React Native and Worklets

Use React Native 0.86+, Reanimated 4.7.1+, and Worklets 0.13.0+. The demos
use Expo SDK 57. Worklets contains the upstream serialization race fix, so
the former Worklets 0.11.4 patch is no longer needed.
The tested WebGPU configuration still uses a native patch; see the
[WebGPU setup instructions](README.md#optional-webgpu-renderer).

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
