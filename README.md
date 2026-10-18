<img width="1536" height="1024" alt="banner" src="https://github.com/user-attachments/assets/b1ba1804-972a-41a3-b918-2bff71478f83" />

# react-native-fast-confetti 🎊

Confetti animations for React Native with Skia and an optional WebGPU renderer.

> [!NOTE]
> Using v2? See [the v2 documentation](README_V2.md) and [migration guide](MIGRATION_V2_V3.md).
> For v1, see [the v1 documentation](README_V1.md).

<table>
  <tr>
    <td align="center">
      <video src="https://github.com/user-attachments/assets/306f8f64-a437-49d0-acd0-9c565d90a400" width="100%" autoplay loop muted></video>
    </td>
    <td align="center">
      <video src="https://github.com/user-attachments/assets/49124172-5f78-457a-b828-c49cd8c5d5b2" width="100%" autoplay loop muted></video>
    </td>
  </tr>
  <tr>
    <td colspan="2" align="center">
      <video src="https://github.com/user-attachments/assets/61755459-0540-4783-9206-088ba2ff0ffa" width="100%" autoplay loop muted></video>
    </td>
  </tr>
</table>

## New in v3

- An optional [WebGPU renderer](#optional-webgpu-renderer) performs particle physics
  and rendering on the GPU. Android frame submission runs on a dedicated worker.
- Skia 3 support brings the default renderer to the Graphite backend.
- `opacityAnimation` replaces `fadeOutOnEnd` with configurable opacity keyframes
  for finite animations.
- Flake shapes include hearts, stars, flowers, and streamers alongside rectangles.
- `ConfettiPresets.TwinBloom` provides a deterministic cannon particle system.

## Installation

> [!IMPORTANT]
> This library depends on [react-native-reanimated](https://docs.swmansion.com/react-native-reanimated/docs/guides/compatibility/), [react-native-skia](https://github.com/wcandillon/react-native-skia), and [react-native-worklets](https://docs.swmansion.com/react-native-worklets/docs/guides/compatibility/). Make sure to install those first.

v3 requires React Native `>=0.86 <0.89`, React `>=19`, Skia `>=3.4 <4`,
Reanimated `>=4.7.1 <5`, and Worklets `>=0.13 <1`.
WebGPU is an optional dependency. You do not need to install it for the default
Skia renderer. Install it only to use the `/gpu` entry point; Skia remains
required for texture and shape preparation in both renderers.
Skia v3 uses Graphite on native platforms and requires Android API 26 with
Vulkan, or iOS 15.1+. Use a development build with Expo. Replace
`@shopify/react-native-skia` with `react-native-skia`; installing both creates
conflicting native modules. When using both Skia and WebGPU, keep their Dawn
versions matched. See the [Skia v3 migration guide](https://wcandillon.github.io/react-native-skia/docs/getting-started/migration/).

```sh
yarn add react-native-fast-confetti@^3 react-native-skia@3.4.0 react-native-reanimated@4.7.1 react-native-worklets@0.13.0
```

Neither renderer requires a React provider. The WebGPU renderer lazily shares
one internal device across mounted confetti components.

For Expo, install `expo-build-properties` and configure Android API 26 or newer
for the default Skia renderer as well. Also install `babel-preset-expo`, which
the Babel configuration below references:

```sh
npx expo install expo-build-properties babel-preset-expo
```

```json
{
  "expo": {
    "plugins": [
      ["expo-build-properties", { "android": { "minSdkVersion": 26 } }]
    ]
  }
}
```

In bare React Native apps, set Android `minSdkVersion` to at least 26 and the
iOS deployment target to at least 15.1, then run `pod install` after upgrading.
For either renderer, configure `react-native-worklets/plugin` last in Babel
and rebuild the native app. Both renderers use the same configuration in Expo:

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { worklets: false }]],
    plugins: ['react-native-worklets/plugin'],
  };
};
```

### Optional WebGPU renderer

For GPU-resident physics and rendering, install the optional WebGPU peer and
use the separate entry point. The shaders ship precompiled, so no other GPU
dependency or Babel plugin is needed:

```sh
yarn add react-native-webgpu@0.16.1
```

```tsx
import { Confetti } from 'react-native-fast-confetti/gpu';

<Confetti autoplay>
  <Confetti.Flake size={12} radius={6} />
</Confetti>;
```

When using the WebGPU renderer, native Expo apps must also add
`react-native-webgpu` to `plugins`. Android requires
API 26 or newer:

```json
{
  "expo": {
    "plugins": [
      "react-native-webgpu",
      ["expo-build-properties", { "android": { "minSdkVersion": 26 } }]
    ]
  }
}
```

The WebGPU entry exports `Confetti`, `ContinuousConfetti`, `PIConfetti`, and
`CannonConfetti` with the same component API. By default, mounted GPU confetti
components lazily share one device. To coordinate with another WebGPU renderer,
pass an app-owned `GPUDevice`; the confetti component borrows it and never
destroys it:

```tsx
<Confetti device={device} autoplay />
```

The owner of an injected device is responsible for replacing it after device
loss. Keep all work submitted to a shared device serialized on one runtime.

Read about [WebGPU specific features](#webgpu-features) and
[WebGPU caveats](#webgpu-caveats).

The tested native stack is Expo 58, React Native 0.88.0, Reanimated 4.7.1,
Worklets 0.13.0, and WebGPU 0.16.1. This repository uses unpatched dependencies.

On native platforms, app-owned devices shared across runtimes with
`uncapturederror` listeners can encounter an upstream error-callback runtime
race. The default confetti renderer does not register those listeners.

## Components

### `<Confetti />`

Confetti pieces fall from the top of the screen.

<table width="100%">
  <tr>
    <td align="center" width="30%">
      <video src="https://github.com/user-attachments/assets/aa62855e-ccd6-47af-91a7-e978236a1362" width="100%" autoplay loop muted></video>
    </td>
    <td width="70%">
      <pre lang="tsx">
import { Confetti } from 'react-native-fast-confetti';

&lt;Confetti autoplay&gt;
&lt;Confetti.Flake size={12} radius={6} /&gt;
&lt;Confetti.Flake width={8} height={14} /&gt;
&lt;Confetti.Flake width={8} height={14} radius={6.5} /&gt;
&lt;Confetti.Flake width={8} height={14} radius={4} /&gt;
&lt;Confetti.Flake size={18} shape="heart" /&gt;
&lt;Confetti.Flake size={18} shape="star" /&gt;
&lt;Confetti.Flake size={17} shape="flower" /&gt;
&lt;Confetti.Flake width={24} height={17} shape="streamer" /&gt;
&lt;/Confetti&gt;;

</pre>
</td>

  </tr>
</table>

### `<ContinuousConfetti />`

A seamless, never-ending stream of confetti.

<table width="100%">
  <tr>
    <td align="center" width="30%">
      <video src="https://github.com/user-attachments/assets/140187ff-3060-40d1-b738-aa211b0ed35a" width="100%" autoplay loop muted></video>
    </td>
    <td width="70%">
      <pre lang="tsx">
import { ContinuousConfetti } from 'react-native-fast-confetti';

&lt;ContinuousConfetti autoplay&gt;
&lt;ContinuousConfetti.Flake size={12} radius={6} /&gt;
&lt;/ContinuousConfetti&gt;;

</pre>
</td>

  </tr>
</table>

### `<PIConfetti />`

Confetti bursts outward from one or more points, then drifts down.

<table width="100%">
  <tr>
    <td align="center" width="30%">
      <video src="https://github.com/user-attachments/assets/e42fb317-0735-40ff-a526-880e146b9380" width="100%" autoplay loop muted></video>
    </td>
    <td width="70%">
      <pre lang="tsx">
import { PIConfetti } from 'react-native-fast-confetti';

&lt;PIConfetti autoplay&gt;
&lt;PIConfetti.Origin blastPosition="center" count={200}&gt;
&lt;PIConfetti.Flake size={12} /&gt;
&lt;/PIConfetti.Origin&gt;
&lt;/PIConfetti&gt;;

</pre>
</td>

  </tr>
</table>

### `<CannonConfetti />`

Launch confetti from multiple origins with individual control over each cannon.

<table width="100%">
  <tr>
    <td align="center" width="30%">
      <video src="https://github.com/user-attachments/assets/0275f0e6-e245-46c5-9ba2-ceac20c4c3da" width="100%" autoplay loop muted></video>
    </td>
    <td width="70%">
      <pre lang="tsx">
import { CannonConfetti } from 'react-native-fast-confetti';

&lt;CannonConfetti autoplay&gt;
&lt;CannonConfetti.Origin position="bottom-left" count={150} initialSpeed={3}&gt;
&lt;CannonConfetti.Flake size={12} radius={6} /&gt;
&lt;/CannonConfetti.Origin&gt;
&lt;CannonConfetti.Origin position="bottom-right" count={150} initialSpeed={3}&gt;
&lt;CannonConfetti.Flake size={12} /&gt;
&lt;/CannonConfetti.Origin&gt;
&lt;/CannonConfetti&gt;;

</pre>
</td>

  </tr>
</table>

Use a built-in motion preset when you want a specific choreographed cannon:

```tsx
import { CannonConfetti, ConfettiPresets } from 'react-native-fast-confetti';

<CannonConfetti autoplay particleSystem={ConfettiPresets.TwinBloom}>
  <CannonConfetti.Origin position="center-left" count={20}>
    <CannonConfetti.Flake size={18} shape="flower" />
  </CannonConfetti.Origin>
  <CannonConfetti.Origin position="center-right" count={16}>
    <CannonConfetti.Flake size={18} shape="star" />
  </CannonConfetti.Origin>
</CannonConfetti>;
```

## Ref Methods

All components expose the same control methods via ref:

```tsx
import { useRef } from 'react';
import { Confetti, ConfettiMethods } from 'react-native-fast-confetti';

const ref = useRef<ConfettiMethods>(null);

<Confetti ref={ref} autoplay={false}>
  <Confetti.Flake size={12} />
</Confetti>;

// Then trigger manually:
ref.current?.restart();
ref.current?.pause();
ref.current?.resume();
ref.current?.reset();
```

| Method    | Description                             |
| --------- | --------------------------------------- |
| `restart` | Start the animation from the beginning. |
| `pause`   | Pause the animation.                    |
| `resume`  | Resume from where it paused.            |
| `reset`   | Reset, clear, and stop the animation.   |

`restart` accepts an optional options object:

- **Confetti / ContinuousConfetti**: no options
- **PIConfetti**: `{ blastPositions }` to override origin blast positions
- **CannonConfetti**: `{ origins }` to override origin positions/targets

## Custom Textures

Same as `<Confetti />` except `verticalSpacing` defaults to `200`.

<table width="100%">
  <tr>
    <th align="center" width="50%">Money Stack</th>
    <th align="center" width="50%">Snow Simulation</th>
  </tr>
  <tr>
    <td align="center" width="50%">
      <video src="https://github.com/user-attachments/assets/614244b9-7961-40be-b33e-9baaccdb959d" width="100%" autoplay loop muted></video>
    </td>
    <td align="center" width="50%">
      <video src="https://github.com/user-attachments/assets/72dafb09-2c2e-422c-ad81-4967117844f7" width="100%" autoplay loop muted></video>
    </td>
  </tr>
</table>

Pass a Skia image or SVG on the parent component or on individual Flake children. Flake-level textures override the parent default.

```tsx
import { useImage, useSVG } from 'react-native-skia';
import { Confetti } from 'react-native-fast-confetti';

const moneyImage = useImage(require('./money.png'));
const snowSvg = useSVG(require('./snowflake.svg'));

// Parent-level texture — applies to all flakes
<Confetti autoplay image={moneyImage}>
  <Confetti.Flake size={50} />
</Confetti>

// Flake-level texture — per flake
<Confetti autoplay>
  <Confetti.Flake size={50} image={moneyImage} />
  <Confetti.Flake size={30} svg={snowSvg} />
  <Confetti.Flake width={8} height={14} />
</Confetti>

// Parent default + flake override
<Confetti autoplay image={moneyImage}>
  <Confetti.Flake size={50} />               {/* uses money image */}
  <Confetti.Flake size={30} svg={snowSvg} /> {/* overrides with SVG */}
</Confetti>
```

### Per-Flake Colors

Each flake group can have its own color palette. Flake-level `colors` override the parent.

```tsx
<Confetti autoplay colors={['#FF0000', '#00FF00']}>
  <Confetti.Flake width={8} height={14} /> {/* red/green */}
  <Confetti.Flake size={12} colors={['#0000FF', '#FFFF00']} />{' '}
  {/* blue/yellow */}
</Confetti>
```

## Named Positions

Props that accept a position (`blastPosition`, `position`, `target`) can use a named string or explicit coordinates:

```tsx
// Named position
<PIConfetti blastPosition="bottom-center" />

// Explicit coordinates
<PIConfetti blastPosition={{ x: 100, y: 200 }} />
```

Available named positions: `top-left`, `top-center`, `top-right`, `center-left`, `center`, `center-right`, `bottom-left`, `bottom-center`, `bottom-right`

## Reduce Motion

By default, confetti respects the device Reduce Motion setting. When Reduce Motion is enabled, the library scales down particle count and motion intensity with a default factor of `0.5`.

```tsx
<Confetti reduceMotion="system" />
<Confetti reduceMotion="never" />
<Confetti reduceMotion={{ mode: 'system', factor: 0.75 }} />
<Confetti reduceMotion={{ mode: 'always', factor: 1 }} />
```

The factor is clamped between `0` and `1`. A factor of `0` keeps full motion; a factor of `1` disables animated confetti.

## Props

### `<Confetti />` Props

| Name               | Default          | Description                                |
| ------------------ | ---------------- | ------------------------------------------ |
| `count`            | 200              | Number of confetti pieces.                 |
| `autoplay`         | true             | Play animation on mount.                   |
| `autoStartDelay`   | 0                | Delay (ms) before autoplay.                |
| `infinite`         | false            | Loop the animation.                        |
| `gravity`          | 1.0              | Gravity strength.                          |
| `colors`           | Built-in palette | Array of color strings.                    |
| `flakeStyle`       | 'glossy'         | `'solid'` or `'glossy'`.                   |
| `opacityAnimation` | N/A              | `enabled` required; keyframes optional.    |
| `image`            | N/A              | Default Skia image texture for all flakes. |
| `svg`              | N/A              | Default Skia SVG texture for all flakes.   |
| `reduceMotion`     | 'system'         | Reduce motion using the system setting.    |
| `onAnimationStart` | N/A              | Called when animation starts.              |
| `onAnimationEnd`   | N/A              | Called when animation ends.                |

<details>
<summary>Advanced props — these work well out of the box, but you can tweak them for full customizability.</summary>

| Name              | Default                  | Description                                                      |
| ----------------- | ------------------------ | ---------------------------------------------------------------- |
| `wobble`          | { min: 0.03, max: 0.08 } | Tumble/bobbing intensity.                                        |
| `drift`           | 0.7                      | Horizontal drift (0-1).                                          |
| `easing`          | Easing.bezier(0.4,0,1,1) | Custom easing for the fall animation progress.                   |
| `flipIntensity`   | 0.85                     | How dramatically pieces flip (0-1). Lower = flatter.             |
| `rotation`        | N/A                      | Rotation range config.                                           |
| `depth`           | { min: 0.8, max: 1.0 }   | 3D perspective scale range.                                      |
| `initialScale`    | 0.3                      | Scale at spawn before growing.                                   |
| `verticalSpacing` | 70                       | Space between rows. Lower = denser.                              |
| `containerStyle`  | N/A                      | Style for the container. Supports any sizing (numeric, %, flex). |

</details>

Keyframe timestamps and values use the `0`–`1` range. Timestamp `0` defaults to
opacity `1`.

```tsx
<Confetti
  opacityAnimation={{
    enabled: true,
    keyframes: { 0.5: 0.5, 0.7: 0 },
  }}
/>
```

### `<ContinuousConfetti />` Props

Same as `<Confetti />` except:

- No `infinite` prop (always infinite)
- No `onAnimationEnd` or `opacityAnimation` props (animation never ends)
- `verticalSpacing` defaults to `200`

### `<PIConfetti />` Props

| Name               | Default          | Description                                  |
| ------------------ | ---------------- | -------------------------------------------- |
| `autoplay`         | true             | Play animation on mount.                     |
| `autoStartDelay`   | 0                | Delay (ms) before autoplay.                  |
| `infinite`         | false            | Loop the animation.                          |
| `gravity`          | 3.0              | Gravity strength.                            |
| `colors`           | Built-in palette | Default colors for all origins.              |
| `flakeStyle`       | 'glossy'         | Default `'solid'` or `'glossy'` for origins. |
| `opacityAnimation` | N/A              | `enabled` required; keyframes optional.      |
| `image`            | N/A              | Default Skia image texture for all flakes.   |
| `svg`              | N/A              | Default Skia SVG texture for all flakes.     |
| `reduceMotion`     | 'system'         | Reduce motion using the system setting.      |
| `onAnimationStart` | N/A              | Called when animation starts.                |
| `onAnimationEnd`   | N/A              | Called when animation ends.                  |

<details>
<summary>Advanced props — these work well out of the box, but you can tweak them for full customizability.</summary>

| Name             | Default                | Description                                                      |
| ---------------- | ---------------------- | ---------------------------------------------------------------- |
| `drag`           | 3.0                    | Air resistance. Number or `{ horizontal, vertical }`.            |
| `sprayDuration`  | N/A                    | Stagger pieces over N ms.                                        |
| `speedVariation` | { min: 0.0, max: 1.0 } | Default speed variation for origins.                             |
| `easing`         | Easing.linear          | Custom easing for the animation progress.                        |
| `flipIntensity`  | 0.85                   | How dramatically pieces flip (0-1). Lower = flatter.             |
| `rotation`       | N/A                    | Default rotation config for origins.                             |
| `depth`          | { min: 1, max: 1.1 }   | Default depth range for origins.                                 |
| `initialScale`   | 0.3                    | Scale at spawn before growing.                                   |
| `containerStyle` | N/A                    | Style for the container. Supports any sizing (numeric, %, flex). |

</details>

### `<PIConfetti.Origin />` Props

| Name                       | Default | Description                                               |
| -------------------------- | ------- | --------------------------------------------------------- |
| `blastPosition` (required) | -       | Where the burst originates. Named position or `{ x, y }`. |
| `count`                    | 100     | Number of pieces from this origin.                        |
| `initialSpeed`             | 1       | Launch speed.                                             |
| `spread`                   | 2\*PI   | Launch cone width (radians).                              |

<details>
<summary>Advanced props — these work well out of the box, but you can tweak them for full customizability.</summary>

| Name             | Default                | Description                                |
| ---------------- | ---------------------- | ------------------------------------------ |
| `speedVariation` | { min: 0.0, max: 1.0 } | Per-piece speed multiplier range.          |
| `colors`         | N/A                    | Colors for this origin (overrides root).   |
| `flakeStyle`     | N/A                    | Style for this origin (overrides root).    |
| `rotation`       | N/A                    | Rotation for this origin (overrides root). |
| `depth`          | { min: 1, max: 1.1 }   | Depth for this origin (overrides root).    |

</details>

### `<CannonConfetti />` Props

| Name               | Default          | Description                                                        |
| ------------------ | ---------------- | ------------------------------------------------------------------ |
| `autoplay`         | true             | Play animation on mount.                                           |
| `autoStartDelay`   | 0                | Delay (ms) before autoplay.                                        |
| `infinite`         | false            | Loop the animation.                                                |
| `gravity`          | 2.5              | Gravity strength.                                                  |
| `target`           | N/A              | Default aim point for all origins.                                 |
| `particleSystem`   | N/A              | Deterministic physics preset, such as `ConfettiPresets.TwinBloom`. |
| `colors`           | Built-in palette | Default colors for all origins.                                    |
| `flakeStyle`       | 'glossy'         | Default `'solid'` or `'glossy'` for origins.                       |
| `opacityAnimation` | N/A              | `enabled` required; keyframes optional.                            |
| `image`            | N/A              | Default Skia image texture for all flakes.                         |
| `svg`              | N/A              | Default Skia SVG texture for all flakes.                           |
| `reduceMotion`     | 'system'         | Reduce motion using the system setting.                            |
| `onAnimationStart` | N/A              | Called when animation starts.                                      |
| `onAnimationEnd`   | N/A              | Called when animation ends.                                        |

<details>
<summary>Advanced props — these work well out of the box, but you can tweak them for full customizability.</summary>

| Name             | Default                | Description                                                      |
| ---------------- | ---------------------- | ---------------------------------------------------------------- |
| `drag`           | 3.0                    | Air resistance. Number or `{ horizontal, vertical }`.            |
| `sprayDuration`  | 300                    | Stagger all cannons over N ms.                                   |
| `speedVariation` | { min: 0.8, max: 1.2 } | Default speed variation for origins.                             |
| `easing`         | Easing.linear          | Custom easing for the animation progress.                        |
| `flipIntensity`  | 0.85                   | How dramatically pieces flip (0-1). Lower = flatter.             |
| `rotation`       | N/A                    | Default rotation config for origins.                             |
| `depth`          | { min: 1, max: 1.1 }   | Default depth range for origins.                                 |
| `initialScale`   | 0.3                    | Scale at spawn before growing.                                   |
| `containerStyle` | N/A                    | Style for the container. Supports any sizing (numeric, %, flex). |

</details>

### `<CannonConfetti.Origin />` Props

| Name                  | Default | Description                                                |
| --------------------- | ------- | ---------------------------------------------------------- |
| `position` (required) | -       | Where the cannon fires from. Named position or `{ x, y }`. |
| `count`               | 100     | Number of pieces from this origin.                         |
| `initialSpeed`        | 2.0     | Launch speed.                                              |
| `spread`              | PI/5    | Launch cone width (radians).                               |
| `target`              | N/A     | Aim point (overrides root `target`).                       |

<details>
<summary>Advanced props — these work well out of the box, but you can tweak them for full customizability.</summary>

| Name             | Default                | Description                                |
| ---------------- | ---------------------- | ------------------------------------------ |
| `speedVariation` | { min: 0.8, max: 1.2 } | Per-piece speed multiplier range.          |
| `colors`         | N/A                    | Colors for this origin (overrides root).   |
| `flakeStyle`     | N/A                    | Style for this origin (overrides root).    |
| `rotation`       | N/A                    | Rotation for this origin (overrides root). |
| `depth`          | { min: 1, max: 1.1 }   | Depth for this origin (overrides root).    |

</details>

### `<*.Flake />` Props

Define flake sizes as children of any confetti component (or origin).

| Name         | Default       | Description                                                                          |
| ------------ | ------------- | ------------------------------------------------------------------------------------ |
| `size`       | -             | Sets both width and height.                                                          |
| `width`      | -             | Flake width (use instead of `size` for non-square).                                  |
| `height`     | -             | Flake height (use instead of `size` for non-square).                                 |
| `radius`     | 0             | Corner radius.                                                                       |
| `shape`      | `'rectangle'` | Built-in `'rectangle'`, `'heart'`, `'star'`, `'flower'`, or `'streamer'` silhouette. |
| `flakeStyle` | N/A           | Override the parent's `flakeStyle`.                                                  |
| `image`      | N/A           | Skia image texture (overrides parent `image`/`svg`).                                 |
| `svg`        | N/A           | Skia SVG texture (overrides parent `image`/`svg`).                                   |
| `colors`     | N/A           | Color palette for this flake group (overrides parent `colors`).                      |

## Compatibility

> [!IMPORTANT]
> v3 requires React Native `>=0.86 <0.89`, Reanimated `>=4.7.1 <5`, and Worklets `>=0.13.0 <1`. Both example apps use Expo SDK 58 and native builds. Historical release compatibility depends on [React Native Reanimated](https://docs.swmansion.com/react-native-reanimated/docs/guides/compatibility/), [React Native Worklets](https://docs.swmansion.com/react-native-worklets/docs/guides/compatibility/), and [React Native Skia](https://github.com/wcandillon/react-native-skia). Skia does not publish a Reanimated-style compatibility matrix, so use its [installation requirements](https://wcandillon.github.io/react-native-skia/docs/getting-started/installation/) as the source of truth.

| Package version   | Tested with React Native | Tested with Skia | Tested with Reanimated | Worklets                  | Tested with WebGPU  | Minimum inferred from API usage                                                                      |
| ----------------- | ------------------------ | ---------------- | ---------------------- | ------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------- |
| `3.0.0`           | `0.88.0`                 | `3.4.0`          | `4.7.1`                | `0.13.0`                  | `0.16.1` (optional) | React Native `>=0.86 <0.89`, React `>=19`, Skia `>=3.4.0`, Reanimated `>=4.7.1`, Worklets `>=0.13.0` |
| `2.0.0`           | `0.83.2`                 | `2.5.1`          | `4.2.2`                | Required via Reanimated 4 | Not supported       | React Native `>=0.79`, React `>=19`, Skia `>=2.0.0`, Reanimated `>=4.0.0`, Worklets `>=0.7.0`        |
| `1.0.0` - `1.1.2` | `0.79.2`                 | `2.0.0-next.4`   | `3.18.0`               | Not required directly     | Not supported       | React Native `>=0.79`, React `>=19`, Skia `2.0.0-next.x` / `>=2.0.0`, Reanimated `>=3.18.0`          |
| `0.8.3`           | `0.79.2`                 | `2.0.0-next.4`   | `3.17.5`               | Not required directly     | Not supported       | React Native `>=0.79`, React `>=19`, Skia `2.0.0-next.x` / `>=2.0.0`, Reanimated `>=3.17.5`          |
| `0.8.1` - `0.8.2` | `0.76.6`                 | `1.4.2`          | `3.16.1`               | Not required directly     | Not supported       | React Native `>=0.76`, React `18.x`, Skia `>=1.4.2`, Reanimated `>=3.16.1`                           |
| `0.2.0` - `0.7.0` | `0.74.5`                 | `1.4.2`          | `3.15.5`               | Not required directly     | Not supported       | React Native `>=0.74`, React `18.x`, Skia `>=1.4.2`, Reanimated `>=3.15.5`                           |

WebGPU is optional in v3 and was not available in earlier confetti releases.
The tested `/gpu` stack uses `react-native-webgpu 0.16.1`, with the peer range
`>=0.16.1 <1`. Skia-only apps do not need it.
When enabling WebGPU, keep its Dawn version matched with Skia's.

For exact app support, check the compatibility pages for the installed versions of Reanimated and Worklets. For Skia, follow the official installation requirements: current Skia versions require React Native `>=0.79` and React `>=19`; React Native `<=0.78` / React `<=18` projects should use Skia `1.12.4` or below.

## WebGPU features

| Prop               | Components                                 | Default         | Description                                             |
| ------------------ | ------------------------------------------ | --------------- | ------------------------------------------------------- |
| `settleOnFloor`    | `Confetti`, `PIConfetti`, `CannonConfetti` | `undefined`     | Configures floor collision, bounce, and settling.       |
| `windStrength`     | `Confetti`, `ContinuousConfetti`           | `0`             | Adds procedural wind.                                   |
| `magnusStrength`   | `Confetti`, `ContinuousConfetti`           | `0`             | Adds spin-driven lateral movement.                      |
| `motionBlurAmount` | `Confetti`, `ContinuousConfetti`           | `0`             | Stretches fast particles along their velocity.          |
| `iridescence`      | `Confetti`, `ContinuousConfetti`           | `0`             | Adds shader-based rim iridescence.                      |
| `textureMode`      | `Confetti`, `ContinuousConfetti`           | `0`             | Selects a procedural material for untextured flakes.    |
| `gravityDir`       | `Confetti`, `ContinuousConfetti`           | `[0, 1, 0]`     | Accepts a shared value for dynamic gravity.             |
| `autoRestart`      | `Confetti`, `ContinuousConfetti`           | `true`          | Controls automatic simulation restarts.                 |
| `opacityAnimation` | `PIConfetti`, `CannonConfetti`             | `undefined`     | Evaluates opacity per flake from its launch time.       |
| `device`           | All WebGPU components                      | `undefined`     | Borrows an app-owned `GPUDevice`.                       |
| `onError`          | All WebGPU components                      | `console.error` | Reports device acquisition and renderer setup failures. |

Android effects default to `androidTransparencyMode="texture"`. The TextureView
moves, fades, and clips with its React Native screen. GPU submission runs on a
shared Android worker, while iOS uses its main-thread Metal surface.
Use `androidTransparencyMode="surface-overlay"` only for an intentional topmost
overlay whose host manages navigation and stacking.

## WebGPU caveats

### Liquid Glass

When a Liquid Glass or blur component is rendered above confetti, the OS must
recalculate the effect every frame, which can cause performance drops. It's recommended to render the confetti component on top of everything else.

## Migrating

- [v2 to v3](MIGRATION_V2_V3.md)
- [v1 to v2](MIGRATION_V1_V2.md)

## Contributing

See the [contributing guide](CONTRIBUTING.md) to learn how to contribute to the repository and the development workflow.

## License

MIT

---

Made with [create-react-native-library](https://github.com/callstack/react-native-builder-bob)
