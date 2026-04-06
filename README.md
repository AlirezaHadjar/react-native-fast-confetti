<img width="1536" height="1024" alt="banner" src="https://github.com/user-attachments/assets/b1ba1804-972a-41a3-b918-2bff71478f83" />

# react-native-fast-confetti 🎊

The fastest confetti animation library for React Native, powered by Skia Atlas API.

> [!NOTE]
> Still using v1? [Click here for the v1 documentation.](README_V1.md)

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

## Installation

> [!IMPORTANT]
> This library depends on [react-native-reanimated](https://github.com/software-mansion/react-native-reanimated), [@shopify/react-native-skia](https://github.com/Shopify/react-native-skia), and [react-native-worklets](https://docs.swmansion.com/react-native-worklets). Make sure to install those first.

```sh
yarn add react-native-fast-confetti
```

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

&lt;CannonConfetti autoplay gravity={3}&gt;
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
| `reset`   | Reset and stop the animation.           |

`restart` accepts an optional options object:

- **Confetti / ContinuousConfetti**: no options
- **PIConfetti**: `{ blastPositions }` to override origin blast positions
- **CannonConfetti**: `{ origins }` to override origin positions/targets

## Custom Textures


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
import { useImage, useSVG } from '@shopify/react-native-skia';
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
| `fadeOutOnEnd`     | false            | Fade pieces as they exit.                  |
| `image`            | N/A              | Default Skia image texture for all flakes. |
| `svg`              | N/A              | Default Skia SVG texture for all flakes.   |
| `onAnimationStart` | N/A              | Called when animation starts.              |
| `onAnimationEnd`   | N/A              | Called when animation ends.                |

<details>
<summary>Advanced props — these work well out of the box, but you can tweak them for full customizability.</summary>

| Name              | Default                  | Description                                                     |
| ----------------- | ------------------------ | --------------------------------------------------------------- |
| `wobble`          | { min: 0.03, max: 0.08 }  | Tumble/bobbing intensity.                                       |
| `drift`           | 0.7                       | Horizontal drift (0-1).                                         |
| `easing`          | Easing.bezier(0.4,0,1,1)  | Custom easing for the fall animation progress.                  |
| `flipIntensity`   | 0.85                      | How dramatically pieces flip (0-1). Lower = flatter.            |
| `rotation`        | N/A                       | Rotation range config.                                          |
| `depth`           | { min: 0.8, max: 1.0 }    | 3D perspective scale range.                                     |
| `initialScale`    | 0.3                       | Scale at spawn before growing.                                  |
| `verticalSpacing` | 70                        | Space between rows. Lower = denser.                             |
| `containerStyle`  | N/A                       | Style for the container. Supports any sizing (numeric, %, flex). |

</details>

### `<ContinuousConfetti />` Props

Same as `<Confetti />` except:

- No `infinite` prop (always infinite)
- No `onAnimationEnd` or `fadeOutOnEnd` props (animation never ends)
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
| `fadeOutOnEnd`     | false            | Fade pieces as they exit.                    |
| `image`            | N/A              | Default Skia image texture for all flakes.   |
| `svg`              | N/A              | Default Skia SVG texture for all flakes.     |
| `onAnimationStart` | N/A              | Called when animation starts.                |
| `onAnimationEnd`   | N/A              | Called when animation ends.                  |

<details>
<summary>Advanced props — these work well out of the box, but you can tweak them for full customizability.</summary>

| Name             | Default                | Description                                                     |
| ---------------- | ---------------------- | --------------------------------------------------------------- |
| `drag`           | 3.0                    | Air resistance. Number or `{ horizontal, vertical }`.            |
| `sprayDuration`  | N/A                    | Stagger pieces over N ms.                                        |
| `speedVariation` | { min: 0.0, max: 1.0 } | Default speed variation for origins.                            |
| `easing`         | Easing.linear           | Custom easing for the animation progress.                       |
| `flipIntensity`  | 0.85                   | How dramatically pieces flip (0-1). Lower = flatter.             |
| `rotation`       | N/A                    | Default rotation config for origins.                             |
| `depth`          | { min: 1, max: 1.1 }   | Default depth range for origins.                                 |
| `initialScale`   | 0.3                    | Scale at spawn before growing.                                   |
| `containerStyle` | N/A                    | Style for the container. Supports any sizing (numeric, %, flex). |

</details>

### `<PIConfetti.Origin />` Props

| Name                        | Default | Description                                                         |
| --------------------------- | ------- | ------------------------------------------------------------------- |
| `blastPosition` (required)  | -       | Where the burst originates. Named position or `{ x, y }`.          |
| `count`                     | 100     | Number of pieces from this origin.                                  |
| `initialSpeed`              | 1       | Launch speed.                                                       |
| `spread`                    | 2\*PI   | Launch cone width (radians).                                        |

<details>
<summary>Advanced props — these work well out of the box, but you can tweak them for full customizability.</summary>

| Name             | Default                | Description                                  |
| ---------------- | ---------------------- | -------------------------------------------- |
| `speedVariation` | { min: 0.0, max: 1.0 } | Per-piece speed multiplier range.            |
| `colors`         | N/A                    | Colors for this origin (overrides root).     |
| `flakeStyle`     | N/A                    | Style for this origin (overrides root).      |
| `rotation`       | N/A                    | Rotation for this origin (overrides root).   |
| `depth`          | { min: 1, max: 1.1 }   | Depth for this origin (overrides root).      |

</details>

### `<CannonConfetti />` Props

| Name               | Default          | Description                                  |
| ------------------ | ---------------- | -------------------------------------------- |
| `autoplay`         | true             | Play animation on mount.                     |
| `autoStartDelay`   | 0                | Delay (ms) before autoplay.                  |
| `infinite`         | false            | Loop the animation.                          |
| `gravity`          | 3.0              | Gravity strength.                            |
| `target`           | N/A              | Default aim point for all origins.           |
| `colors`           | Built-in palette | Default colors for all origins.              |
| `flakeStyle`       | 'glossy'         | Default `'solid'` or `'glossy'` for origins. |
| `fadeOutOnEnd`     | false            | Fade pieces as they exit.                    |
| `image`            | N/A              | Default Skia image texture for all flakes.   |
| `svg`              | N/A              | Default Skia SVG texture for all flakes.     |
| `onAnimationStart` | N/A              | Called when animation starts.                |
| `onAnimationEnd`   | N/A              | Called when animation ends.                  |

<details>
<summary>Advanced props — these work well out of the box, but you can tweak them for full customizability.</summary>

| Name             | Default                | Description                                                     |
| ---------------- | ---------------------- | --------------------------------------------------------------- |
| `drag`           | 3.0                    | Air resistance. Number or `{ horizontal, vertical }`.            |
| `sprayDuration`  | 300                    | Stagger all cannons over N ms.                                   |
| `speedVariation` | { min: 0.8, max: 1.2 } | Default speed variation for origins.                             |
| `easing`         | Easing.linear           | Custom easing for the animation progress.                        |
| `flipIntensity`  | 0.85                   | How dramatically pieces flip (0-1). Lower = flatter.             |
| `rotation`       | N/A                    | Default rotation config for origins.                              |
| `depth`          | { min: 1, max: 1.1 }   | Default depth range for origins.                                  |
| `initialScale`   | 0.3                    | Scale at spawn before growing.                                    |
| `containerStyle` | N/A                    | Style for the container. Supports any sizing (numeric, %, flex).  |

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

| Name         | Default | Description                                                     |
| ------------ | ------- | --------------------------------------------------------------- |
| `size`       | -       | Sets both width and height.                                     |
| `width`      | -       | Flake width (use instead of `size` for non-square).             |
| `height`     | -       | Flake height (use instead of `size` for non-square).            |
| `radius`     | 0       | Corner radius.                                                  |
| `flakeStyle` | N/A     | Override the parent's `flakeStyle`.                             |
| `image`      | N/A     | Skia image texture (overrides parent `image`/`svg`).            |
| `svg`        | N/A     | Skia SVG texture (overrides parent `image`/`svg`).              |
| `colors`     | N/A     | Color palette for this flake group (overrides parent `colors`). |

## Migrating from v1

See the [migration guide](MIGRATION_V1_V2.md) for a detailed mapping of v1 props to v2.

## Contributing

See the [contributing guide](CONTRIBUTING.md) to learn how to contribute to the repository and the development workflow.

## License

MIT

---

Made with [create-react-native-library](https://github.com/callstack/react-native-builder-bob)
