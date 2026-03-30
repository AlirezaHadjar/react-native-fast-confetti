# react-native-fast-confetti 🎊

The fastest confetti animation library for React Native, powered by Skia Atlas API.

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
> This library depends on [react-native-reanimated](https://github.com/software-mansion/react-native-reanimated) and [@shopify/react-native-skia](https://github.com/Shopify/react-native-skia). Make sure to install those first.

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

Confetti bursts outward from a point, then drifts down.

<table width="100%">
  <tr>
    <td align="center" width="30%">
      <video src="https://github.com/user-attachments/assets/e42fb317-0735-40ff-a526-880e146b9380" width="100%" autoplay loop muted></video>
    </td>
    <td width="70%">
      <pre lang="tsx">
import { PIConfetti } from 'react-native-fast-confetti';

&lt;PIConfetti autoplay blastPosition="center"&gt;
  &lt;PIConfetti.Flake size={12} /&gt;
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
  &lt;CannonConfetti.Origin position="bottom-left" count={150} speed={3}&gt;
    &lt;CannonConfetti.Flake size={12} radius={6} /&gt;
  &lt;/CannonConfetti.Origin&gt;
  &lt;CannonConfetti.Origin position="bottom-right" count={150} speed={3}&gt;
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
- **PIConfetti**: `{ blastPosition }` to override the blast position
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
      <video src="https://github.com/user-attachments/assets/26e3b63c-4e80-4cf4-8400-ab168690b080" width="100%" autoplay loop muted></video>
    </td>
  </tr>
</table>

Pass a Skia image or SVG directly as a prop:

```tsx
import { useImage, useSVG } from '@shopify/react-native-skia';
import { Confetti } from 'react-native-fast-confetti';

const moneyImage = useImage(require('./money.png'));
const snowSvg = useSVG(require('./snowflake.svg'));

// Image texture
<Confetti image={moneyImage} autoplay>
  <Confetti.Flake size={50} />
</Confetti>

// SVG texture
<Confetti svg={snowSvg} autoplay>
  <Confetti.Flake size={30} />
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

| Name               | Default          | Description                   |
| ------------------ | ---------------- | ----------------------------- |
| `count`            | 200              | Number of confetti pieces.    |
| `autoplay`         | true             | Play animation on mount.      |
| `infinite`         | false            | Loop the animation.           |
| `gravity`          | 1.0              | Gravity strength.             |
| `colors`           | Built-in palette | Array of color strings.       |
| `flakeStyle`       | 'solid'          | `'solid'` or `'glossy'`.      |
| `fadeOutOnEnd`     | false            | Fade pieces as they exit.     |
| `image`            | N/A              | Skia image texture.           |
| `svg`              | N/A              | Skia SVG texture.             |
| `onAnimationStart` | N/A              | Called when animation starts. |
| `onAnimationEnd`   | N/A              | Called when animation ends.   |
| `width`            | Screen width     | Container width.              |
| `height`           | Screen height    | Container height.             |

<details>
<summary>Advanced props — these work well out of the box, but you can tweak them for full customizability.</summary>

| Name              | Default                  | Description                             |
| ----------------- | ------------------------ | --------------------------------------- |
| `flutter`         | { min: 0.03, max: 0.08 } | Tumble/bobbing intensity.               |
| `drift`           | 0.7                      | Horizontal drift (0-1).                 |
| `tumbleClamp`     | 0.15                     | Minimum scale during tumble (0.15-0.9). |
| `rotation`        | N/A                      | Rotation range config.                  |
| `depth`           | { min: 0.8, max: 1.0 }   | 3D perspective scale range.             |
| `initialScale`    | 0.3                      | Scale at spawn before growing.          |
| `verticalSpacing` | 70                       | Space between rows. Lower = denser.     |
| `containerStyle`  | N/A                      | Style for the container.                |

</details>

### `<ContinuousConfetti />` Props

Same as `<Confetti />` except:

- No `infinite` prop (always infinite)
- `verticalSpacing` defaults to `200`

### `<PIConfetti />` Props

| Name               | Default               | Description                                 |
| ------------------ | --------------------- | ------------------------------------------- |
| `count`            | 200                   | Number of confetti pieces.                  |
| `autoplay`         | true                  | Play animation on mount.                    |
| `infinite`         | false                 | Loop the animation.                         |
| `blastPosition`    | { x: center, y: 150 } | Burst origin. Named position or `{ x, y }`. |
| `initialSpeed`     | 1                     | Launch speed.                               |
| `gravity`          | 3.0                   | Gravity strength.                           |
| `colors`           | Built-in palette      | Array of color strings.                     |
| `flakeStyle`       | 'solid'               | `'solid'` or `'glossy'`.                    |
| `fadeOutOnEnd`     | false                 | Fade pieces as they exit.                   |
| `image`            | N/A                   | Skia image texture.                         |
| `svg`              | N/A                   | Skia SVG texture.                           |
| `onAnimationStart` | N/A                   | Called when animation starts.               |
| `onAnimationEnd`   | N/A                   | Called when animation ends.                 |
| `width`            | Screen width          | Container width.                            |
| `height`           | Screen height         | Container height.                           |

<details>
<summary>Advanced props — these work well out of the box, but you can tweak them for full customizability.</summary>

| Name             | Default                | Description                       |
| ---------------- | ---------------------- | --------------------------------- |
| `drag`           | 3.0                    | Air resistance.                   |
| `spread`         | 2\*PI                  | Launch cone width (radians).      |
| `sprayDuration`  | N/A                    | Stagger pieces over N ms.         |
| `speedVariation` | { min: 0.0, max: 1.0 } | Per-piece speed multiplier range. |
| `rotation`       | N/A                    | Rotation range config.            |
| `depth`          | { min: 1, max: 1.1 }   | 3D perspective scale range.       |
| `initialScale`   | 0.3                    | Scale at spawn before growing.    |
| `containerStyle` | N/A                    | Style for the container.          |

</details>

### `<CannonConfetti />` Props

| Name               | Default          | Description                                  |
| ------------------ | ---------------- | -------------------------------------------- |
| `autoplay`         | true             | Play animation on mount.                     |
| `infinite`         | false            | Loop the animation.                          |
| `gravity`          | 3.0              | Gravity strength.                            |
| `target`           | N/A              | Default aim point for all origins.           |
| `colors`           | Built-in palette | Default colors for all origins.              |
| `flakeStyle`       | 'solid'          | Default `'solid'` or `'glossy'` for origins. |
| `fadeOutOnEnd`     | false            | Fade pieces as they exit.                    |
| `image`            | N/A              | Skia image texture.                          |
| `svg`              | N/A              | Skia SVG texture.                            |
| `onAnimationStart` | N/A              | Called when animation starts.                |
| `onAnimationEnd`   | N/A              | Called when animation ends.                  |
| `width`            | Screen width     | Container width.                             |
| `height`           | Screen height    | Container height.                            |

<details>
<summary>Advanced props — these work well out of the box, but you can tweak them for full customizability.</summary>

| Name             | Default                | Description                                           |
| ---------------- | ---------------------- | ----------------------------------------------------- |
| `drag`           | 3.0                    | Air resistance. Number or `{ horizontal, vertical }`. |
| `sprayDuration`  | 300                    | Stagger all cannons over N ms.                        |
| `speedVariation` | { min: 0.8, max: 1.2 } | Default speed variation for origins.                  |
| `rotation`       | N/A                    | Default rotation config for origins.                  |
| `depth`          | { min: 1, max: 1.1 }   | Default depth range for origins.                      |
| `initialScale`   | 0.3                    | Scale at # react-native-fast-confetti 🎊              |

The fastest confetti animation library for React Native, powered by Skia Atlas API.

<table>
  <tr>
    <td align="center">
      <img src="https://github.com/user-attachments/assets/306f8f64-a437-49d0-acd0-9c565d90a400" width="100%" />
    </td>
    <td align="center">
      <img src="https://github.com/user-attachments/assets/49124172-5f78-457a-b828-c49cd8c5d5b2" width="100%" />
    </td>
  </tr>
  <tr>
    <td colspan="2" align="center">
      <img src="https://github.com/user-attachments/assets/61755459-0540-4783-9206-088ba2ff0ffa" width="100%" />
    </td>
  </tr>
</table>

## Installation

> [!IMPORTANT]
> This library depends on [react-native-reanimated](https://github.com/software-mansion/react-native-reanimated) and [@shopify/react-native-skia](https://github.com/Shopify/react-native-skia). Make sure to install those first.

```sh
yarn add react-native-fast-confetti
```

## Components

### `<Confetti />`

Confetti pieces fall from the top of the screen.

https://github.com/user-attachments/assets/d89ef248-6b27-435e-a322-fb62a3550343

```tsx
import { Confetti } from 'react-native-fast-confetti';

<Confetti autoplay>
  <Confetti.Flake size={12} radius={6} />
  <Confetti.Flake width={8} height={14} />
  <Confetti.Flake width={8} height={14} radius={6.5} />
  <Confetti.Flake width={8} height={14} radius={4} />
</Confetti>;
```

### `<ContinuousConfetti />`

A seamless, never-ending stream of confetti.

https://github.com/user-attachments/assets/d2b029c6-ffb8-46cb-9050-e71f95c4b4d7

```tsx
import { ContinuousConfetti } from 'react-native-fast-confetti';

<ContinuousConfetti autoplay>
  <ContinuousConfetti.Flake size={12} radius={6} />
</ContinuousConfetti>;
```

### `<PIConfetti />`

Confetti bursts outward from a point, then drifts down.

https://github.com/user-attachments/assets/30008c3b-0f1a-4dff-afdb-2ded80809291

```tsx
import { PIConfetti } from 'react-native-fast-confetti';

<PIConfetti autoplay blastPosition="center">
  <PIConfetti.Flake size={12} />
</PIConfetti>;
```

### `<CannonConfetti />`

Launch confetti from multiple origins with individual control over each cannon.

https://github.com/user-attachments/assets/f59b930d-7c22-4901-9c3e-995cc66b6ae9

```tsx
import { CannonConfetti } from 'react-native-fast-confetti';

<CannonConfetti autoplay gravity={3}>
  <CannonConfetti.Origin position="bottom-left" count={150} speed={3}>
    <CannonConfetti.Flake size={12} radius={6} />
  </CannonConfetti.Origin>
  <CannonConfetti.Origin position="bottom-right" count={150} speed={3}>
    <CannonConfetti.Flake size={12} />
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
| `reset`   | Reset and stop the animation.           |

`restart` accepts an optional options object:

- **Confetti / ContinuousConfetti**: no options
- **PIConfetti**: `{ blastPosition }` to override the blast position
- **CannonConfetti**: `{ origins }` to override origin positions/targets

## Custom Textures

| Money Stack                                                                                                               | Snow Simulation                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| <video src="https://github.com/user-attachments/assets/a4e94186-b906-44bb-a2f6-8232ca2a1436" autoplay loop muted></video> | <video src="https://github.com/user-attachments/assets/caa2985b-1717-41f8-bbb6-7d4da1ac0c32" autoplay loop muted></video> |

Pass a Skia image or SVG directly as a prop:

```tsx
import { useImage, useSVG } from '@shopify/react-native-skia';
import { Confetti } from 'react-native-fast-confetti';

const moneyImage = useImage(require('./money.png'));
const snowSvg = useSVG(require('./snowflake.svg'));

// Image texture
<Confetti image={moneyImage} autoplay>
  <Confetti.Flake size={50} />
</Confetti>

// SVG texture
<Confetti svg={snowSvg} autoplay>
  <Confetti.Flake size={30} />
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

| Name               | Default          | Description                   |
| ------------------ | ---------------- | ----------------------------- |
| `count`            | 200              | Number of confetti pieces.    |
| `autoplay`         | true             | Play animation on mount.      |
| `infinite`         | false            | Loop the animation.           |
| `gravity`          | 1.0              | Gravity strength.             |
| `colors`           | Built-in palette | Array of color strings.       |
| `flakeStyle`       | 'solid'          | `'solid'` or `'glossy'`.      |
| `fadeOutOnEnd`     | false            | Fade pieces as they exit.     |
| `image`            | N/A              | Skia image texture.           |
| `svg`              | N/A              | Skia SVG texture.             |
| `onAnimationStart` | N/A              | Called when animation starts. |
| `onAnimationEnd`   | N/A              | Called when animation ends.   |
| `width`            | Screen width     | Container width.              |
| `height`           | Screen height    | Container height.             |

<details>
<summary>Advanced props — these work well out of the box, but you can tweak them for full customizability.</summary>

| Name              | Default                  | Description                             |
| ----------------- | ------------------------ | --------------------------------------- |
| `flutter`         | { min: 0.03, max: 0.08 } | Tumble/bobbing intensity.               |
| `drift`           | 0.7                      | Horizontal drift (0-1).                 |
| `tumbleClamp`     | 0.15                     | Minimum scale during tumble (0.15-0.9). |
| `rotation`        | N/A                      | Rotation range config.                  |
| `depth`           | { min: 0.8, max: 1.0 }   | 3D perspective scale range.             |
| `initialScale`    | 0.3                      | Scale at spawn before growing.          |
| `verticalSpacing` | 70                       | Space between rows. Lower = denser.     |
| `containerStyle`  | N/A                      | Style for the container.                |

</details>

### `<ContinuousConfetti />` Props

Same as `<Confetti />` except:

- No `infinite` prop (always infinite)
- `verticalSpacing` defaults to `200`

### `<PIConfetti />` Props

| Name               | Default               | Description                                 |
| ------------------ | --------------------- | ------------------------------------------- |
| `count`            | 200                   | Number of confetti pieces.                  |
| `autoplay`         | true                  | Play animation on mount.                    |
| `infinite`         | false                 | Loop the animation.                         |
| `blastPosition`    | { x: center, y: 150 } | Burst origin. Named position or `{ x, y }`. |
| `initialSpeed`     | 1                     | Launch speed.                               |
| `gravity`          | 3.0                   | Gravity strength.                           |
| `colors`           | Built-in palette      | Array of color strings.                     |
| `flakeStyle`       | 'solid'               | `'solid'` or `'glossy'`.                    |
| `fadeOutOnEnd`     | false                 | Fade pieces as they exit.                   |
| `image`            | N/A                   | Skia image texture.                         |
| `svg`              | N/A                   | Skia SVG texture.                           |
| `onAnimationStart` | N/A                   | Called when animation starts.               |
| `onAnimationEnd`   | N/A                   | Called when animation ends.                 |
| `width`            | Screen width          | Container width.                            |
| `height`           | Screen height         | Container height.                           |

<details>
<summary>Advanced props — these work well out of the box, but you can tweak them for full customizability.</summary>

| Name             | Default                | Description                       |
| ---------------- | ---------------------- | --------------------------------- |
| `drag`           | 3.0                    | Air resistance.                   |
| `spread`         | 2\*PI                  | Launch cone width (radians).      |
| `sprayDuration`  | N/A                    | Stagger pieces over N ms.         |
| `speedVariation` | { min: 0.0, max: 1.0 } | Per-piece speed multiplier range. |
| `rotation`       | N/A                    | Rotation range config.            |
| `depth`          | { min: 1, max: 1.1 }   | 3D perspective scale range.       |
| `initialScale`   | 0.3                    | Scale at spawn before growing.    |
| `containerStyle` | N/A                    | Style for the container.          |

</details>

### `<CannonConfetti />` Props

| Name               | Default          | Description                                  |
| ------------------ | ---------------- | -------------------------------------------- |
| `autoplay`         | true             | Play animation on mount.                     |
| `infinite`         | false            | Loop the animation.                          |
| `gravity`          | 3.0              | Gravity strength.                            |
| `target`           | N/A              | Default aim point for all origins.           |
| `colors`           | Built-in palette | Default colors for all origins.              |
| `flakeStyle`       | 'solid'          | Default `'solid'` or `'glossy'` for origins. |
| `fadeOutOnEnd`     | false            | Fade pieces as they exit.                    |
| `image`            | N/A              | Skia image texture.                          |
| `svg`              | N/A              | Skia SVG texture.                            |
| `onAnimationStart` | N/A              | Called when animation starts.                |
| `onAnimationEnd`   | N/A              | Called when animation ends.                  |
| `width`            | Screen width     | Container width.                             |
| `height`           | Screen height    | Container height.                            |

<details>
<summary>Advanced props — these work well out of the box, but you can tweak them for full customizability.</summary>

| Name             | Default                | Description                                           |
| ---------------- | ---------------------- | ----------------------------------------------------- |
| `drag`           | 3.0                    | Air resistance. Number or `{ horizontal, vertical }`. |
| `sprayDuration`  | 300                    | Stagger all cannons over N ms.                        |
| `speedVariation` | { min: 0.8, max: 1.2 } | Default speed variation for origins.                  |
| `rotation`       | N/A                    | Default rotation config for origins.                  |
| `depth`          | { min: 1, max: 1.1 }   | Default depth range for origins.                      |
| `initialScale`   | 0.3                    | Scale at spawn before growing.                        |
| `containerStyle` | N/A                    | Style for the container.                              |

</details>

### `<CannonConfetti.Origin />` Props

| Name                  | Default | Description                                                |
| --------------------- | ------- | ---------------------------------------------------------- |
| `position` (required) | -       | Where the cannon fires from. Named position or `{ x, y }`. |
| `count`               | 100     | Number of pieces from this origin.                         |
| `speed`               | 2.0     | Launch speed.                                              |
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

| Name         | Default | Description                                          |
| ------------ | ------- | ---------------------------------------------------- |
| `size`       | -       | Sets both width and height.                          |
| `width`      | -       | Flake width (use instead of `size` for non-square).  |
| `height`     | -       | Flake height (use instead of `size` for non-square). |
| `radius`     | 0       | Corner radius.                                       |
| `flakeStyle` | N/A     | Override the parent's `flakeStyle`.                  |

> Use either `size` or `width`/`height`, not both.

## Contributing

See the [contributing guide](CONTRIBUTING.md) to learn how to contribute to the repository and the development workflow.

## License

MIT

---

Made with [create-react-native-library](https://github.com/callstack/react-native-builder-bob)
spawn before growing. |
| `containerStyle` | N/A | Style for the container. |

</details>

### `<CannonConfetti.Origin />` Props

| Name                  | Default | Description                                                |
| --------------------- | ------- | ---------------------------------------------------------- |
| `position` (required) | -       | Where the cannon fires from. Named position or `{ x, y }`. |
| `count`               | 100     | Number of pieces from this origin.                         |
| `speed`               | 2.0     | Launch speed.                                              |
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

| Name         | Default | Description                                          |
| ------------ | ------- | ---------------------------------------------------- |
| `size`       | -       | Sets both width and height.                          |
| `width`      | -       | Flake width (use instead of `size` for non-square).  |
| `height`     | -       | Flake height (use instead of `size` for non-square). |
| `radius`     | 0       | Corner radius.                                       |
| `flakeStyle` | N/A     | Override the parent's `flakeStyle`.                  |

> Use either `size` or `width`/`height`, not both.

## Contributing

See the [contributing guide](CONTRIBUTING.md) to learn how to contribute to the repository and the development workflow.

## License

MIT

---

Made with [create-react-native-library](https://github.com/callstack/react-native-builder-bob)
