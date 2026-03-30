<img width="1536" height="1024" alt="banner" src="https://github.com/user-attachments/assets/b1ba1804-972a-41a3-b918-2bff71478f83" />

<br />

<div align="center">
  <h2>v2 is here! More customizable, simpler API, physics-based animations.</h2>
  <h3><a href="https://github.com/AlirezaHadjar/react-native-fast-confetti/tree/feat/v2">Check out v2</a></h3>
</div>

<br />

---

# react-native-fast-confetti 🎊

The fastest confetti animation library for React Native, powered by Skia Atlas API.

https://github.com/user-attachments/assets/968a376f-f20c-4a94-886b-65b1625891ae

https://github.com/user-attachments/assets/97184ffd-4146-4806-8262-8f97373e612c

## Installation

> [!IMPORTANT]
> This library depends on [react-native-reanimated](https://github.com/software-mansion/react-native-reanimated) and [@shopify/react-native-skia](https://github.com/Shopify/react-native-skia). Make sure to install those first.

```sh
yarn add react-native-fast-confetti
```

## Usage

### `<Confetti />`

Creates a basic confetti effect where pieces fall from the top in a straight line.

https://github.com/user-attachments/assets/d89ef248-6b27-435e-a322-fb62a3550343

You can also use the `cannonsPositions` option to simulate confetti being launched from cannons before falling.

https://github.com/user-attachments/assets/f59b930d-7c22-4901-9c3e-995cc66b6ae9

```tsx
import { Confetti, ConfettiMethods } from 'react-native-fast-confetti';

const confettiRef = useRef<ConfettiMethods>(null);

return (
  <View>
    <Confetti ref={confettiRef} />
  </View>
);
```

### `<PIConfetti />`

Creates an effect where flakes burst outward from the center, then drift down gracefully.

https://github.com/user-attachments/assets/30008c3b-0f1a-4dff-afdb-2ded80809291

```tsx
import { PIConfetti, PIConfettiMethods } from 'react-native-fast-confetti';

const confettiRef = useRef<PIConfettiMethods>(null);

return (
  <View>
    <PIConfetti ref={confettiRef} />
  </View>
);
```

### `<ContinuousConfetti />`

Creates a continuous confetti effect where flakes continuously fall from the top.

https://github.com/user-attachments/assets/d2b029c6-ffb8-46cb-9050-e71f95c4b4d7

```tsx
import { ContinuousConfetti } from 'react-native-fast-confetti';

return (
  <View>
    <ContinuousConfetti />
  </View>
);
```

### Custom Textures

You can pass a custom SVG or image to use as the confetti flake.

| Money Stack | Snow Simulation |
|-------------|-----------------|
| <video src="https://github.com/user-attachments/assets/a4e94186-b906-44bb-a2f6-8232ca2a1436" autoplay loop muted></video> | <video src="https://github.com/user-attachments/assets/caa2985b-1717-41f8-bbb6-7d4da1ac0c32" autoplay loop muted></video> |

```tsx
import { Confetti } from 'react-native-fast-confetti';
import { useImage, useSVG } from '@shopify/react-native-skia';

const snowFlakeSVG = useSVG(require('../assets/snow-flake.svg'));
const moneyStackImage = useImage(require('../assets/money-stack.png'));

// Image texture
<Confetti type="image" flakeImage={moneyStackImage} />

// SVG texture
<Confetti type="svg" flakeSvg={snowFlakeSVG} />
```

## Props

### `<Confetti />` Props

| Name | Default | Description |
|------|---------|-------------|
| `count` | 200 | Number of confetti pieces to render. |
| `flakeSize` | { width: 8, height: 16 } | The size of each confetti flake. |
| `width` | SCREEN_WIDTH | The width of the confetti container. |
| `height` | SCREEN_HEIGHT | The height of the confetti container. |
| `fallDuration` | 8000 | Duration of confetti falling (ms). |
| `blastDuration` | 300 | Duration of confetti blast (ms). |
| `cannonsPositions` | N/A | Array of positions from which confetti should blast. |
| `autoplay` | true | Whether the animation should play on mount. |
| `isInfinite` | true | Whether the animation should loop. |
| `colors` | N/A | Array of confetti flake colors. |
| `autoStartDelay` | 0 | Delay before animation starts (ms). |
| `verticalSpacing` | 30 | Space between confetti flakes vertically. |
| `fadeOutOnEnd` | N/A | Fade out flakes as they reach the bottom. |
| `onAnimationStart` | N/A | Callback when animation starts. |
| `onAnimationEnd` | N/A | Callback when animation ends. |
| `sizeVariation` | 0 | Random size variation (0-0.5 recommended). |
| `rotation` | { x: { min: 2π, max: 20π }, z: { min: 2π, max: 20π } } | Rotation config for flakes. |
| `randomSpeed` | { min: 0.9, max: 1.3 } | Random speed multiplier. |
| `randomOffset` | { x: { min: -50, max: 50 }, y: { min: 0, max: 150 } } | Random offset for flakes. |
| `easing` | Easing.inOut(Easing.quad) | Easing function for the animation. |
| `type` | 'default' | Texture type: 'default', 'image', or 'svg'. |
| `flakeImage` | N/A | Image to use as flake (when type is 'image'). |
| `flakeSvg` | N/A | SVG to use as flake (when type is 'svg'). |
| `radiusRange` | [0, 0] | Corner radius range for flakes. |
| `containerStyle` | N/A | Style of the confetti container. |

### `<PIConfetti />` Props

| Name | Default | Description |
|------|---------|-------------|
| `count` | 200 | Number of confetti pieces. |
| `flakeSize` | { width: 8, height: 16 } | Size of each confetti flake. |
| `width` | SCREEN_WIDTH | Container width. |
| `height` | SCREEN_HEIGHT | Container height. |
| `blastDuration` | 300 | Duration of blast (ms). |
| `fallDuration` | 8000 | Duration of falling (ms). |
| `blastPosition` | { x: center, y: 150 } | Position from which flakes blast. |
| `blastRadius` | 180 | Radius of the blast. |
| `colors` | N/A | Array of flake colors. |
| `fadeOutOnEnd` | N/A | Fade out flakes at the bottom. |
| `onAnimationStart` | N/A | Callback when animation starts. |
| `onAnimationEnd` | N/A | Callback when animation ends. |
| `sizeVariation` | 0 | Random size variation. |
| `rotation` | { x: { min: π, max: 3π }, z: { min: π, max: 3π } } | Rotation config. |
| `type` | 'default' | Texture type. |
| `flakeImage` | N/A | Image texture. |
| `flakeSvg` | N/A | SVG texture. |
| `radiusRange` | [0, 0] | Corner radius range. |
| `containerStyle` | N/A | Container style. |

### `<ContinuousConfetti />` Props

Same as `<Confetti />` except `verticalSpacing` defaults to `200`.

## Ref Methods

| Method | Description |
|--------|-------------|
| `restart` | Start the animation from the beginning. |
| `pause` | Pause the animation. |
| `reset` | Reset the animation and stop it. |
| `resume` | Resume from where it paused. |

`restart` accepts an optional options object:

- **Confetti**: `{ cannonsPositions }` to override cannon positions
- **PIConfetti**: `{ blastPosition }` to override the blast position

## Contributing

See the [contributing guide](CONTRIBUTING.md) to learn how to contribute to the repository and the development workflow.

## License

MIT

---

Made with [create-react-native-library](https://github.com/callstack/react-native-builder-bob)
