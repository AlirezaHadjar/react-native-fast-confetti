# react-native-fast-confetti 🎊

🏎️ The fastest confetti animation library in react native written using Skia Atlas API

https://github.com/user-attachments/assets/968a376f-f20c-4a94-886b-65b1625891ae

https://github.com/user-attachments/assets/97184ffd-4146-4806-8262-8f97373e612c

### Sreenshots
[PI Confetti](https://github.com/AlirezaHadjar/react-native-fast-confetti/blob/main/images/piconfetti.png)
[Confetti](https://github.com/AlirezaHadjar/react-native-fast-confetti/blob/main/images/confetti.png)


## Installation

> [!IMPORTANT]
> This library depends on [react-native-reanimated](https://github.com/software-mansion/react-native-reanimated) and [@shopify/react-native-skia](https://github.com/Shopify/react-native-skia). Make sure to install those first.

```sh
yarn add react-native-fast-confetti
```

## Usage
### `<Confetti />`
This animation creates a basic confetti effect where pieces fall from the top in a straight line.

https://github.com/user-attachments/assets/d89ef248-6b27-435e-a322-fb62a3550343

You can also use the `cannonPositions` option to simulate confetti being launched from cannons before falling. in the screen recording, there's only one cannon. You can also pass multiple cannon positions to shoot confetti from multiple cannons


https://github.com/user-attachments/assets/f59b930d-7c22-4901-9c3e-995cc66b6ae9


```tsx
import { Confetti } from 'react-native-fast-confetti';

// ...

return (
    <View>
    {...Your other components}
    <Confetti />
    {...Your other components}
    </View>
)
```
### `<PIConfetti />`
This confetti type creates an effect where flakes burst outward from the center, and then drift down gracefully.

https://github.com/user-attachments/assets/30008c3b-0f1a-4dff-afdb-2ded80809291


```tsx
import { PIConfetti, ConfettiMethods } from 'react-native-fast-confetti';

const confettiRef = useRef<ConfettiMethods>(null);

// Call confettiRef.restart() to render the confetti

return (
    <View>
    {...Your other components}
    <PIConfetti ref={confettiRef} />
    {...Your other components}
    </View>
)
```


### `<ContinuousConfetti />`
This confetti type creates a continuous confetti effect where flakes continuously fall from the top without stopping.

https://github.com/user-attachments/assets/d2b029c6-ffb8-46cb-9050-e71f95c4b4d7


```tsx
import { ContinuousConfetti } from 'react-native-fast-confetti';

// ...

return (
    <View>
    {...Your other components}
    <ContinuousConfetti />
    {...Your other components}
    </View>
)
```

### Custom texture
You can pass a custom svg or image to use as the confetti flake

| Money Stack | Snow Simulation |
|-------------|-----------------|
| <video src="https://github.com/user-attachments/assets/a4e94186-b906-44bb-a2f6-8232ca2a1436" autoplay loop muted></video> | <video src="https://github.com/user-attachments/assets/caa2985b-1717-41f8-bbb6-7d4da1ac0c32" autoplay loop muted></video> |

```tsx
import { Confetti } from 'react-native-fast-confetti';
import { useImage, useSVG } from '@shopify/react-native-skia';

const snowFlakeSVG = useSVG(require('../assets/snow-flake.svg'));
const moneyStackImage = useImage(require('../assets/money-stack.png'));

return (
    <View>
    <Confetti
      type="image"
      flakeImage={moneyStackImage}
    />
    <Confetti
      type="svg"
      flakeSvg={snowFlakeSVG}
    />
    </View>
)
```

## `<Confetti />` Props

| Name               | Required | Default Value            | Description                                                                                       |
| ------------------ | -------- | ------------------------ | ------------------------------------------------------------------------------------------------- |
| `count`            | No       | 200                      | Number of confetti pieces to render.                                                              |
| `flakeSize`        | No       | { width: 8, height: 16 } | The size of each confetti flake (object with `width` and `height`).                               |
| `width`            | No       | SCREEN_WIDTH             | The width of the confetti's container.                                                            |
| `height`           | No       | SCREEN_HEIGHT            | The height of the confetti's container.                                                           |
| `fallDuration`         | No       | 8000 ms                  | The duration of confetti falling down (milliseconds).                                       |
| `blastDuration`         | No       | 300 ms                  | The duration of confetti blast (milliseconds). Use with `cannonsPositions`                                   |
| `cannonsPositions`         | No       | N/A                  | An array of positions from which confetti flakes should blast.                                  |
| `autoplay`         | No       | true                     | Whether the animation should play on mount.                                                       |
| `isInfinite`       | No       | follows `autoplay`       | Wether the animation should play again after it ends.                                             |
| `colors`           | No       | N/A                      | The array of confetti flakes colors.                                                              |
| `autoStartDelay`   | No       | 0                        | Delay before the confetti animation starts automatically (in ms).                                 |
| `verticalSpacing`  | No       | 30                       | The approximate space between confetti flakes vertically. Lower value results in denser confetti. |
| `fadeOutOnEnd`     | No       | N/A                      | Should the confetti flakes fade out as they reach the bottom.                                     |
| `onAnimationStart` | No       | N/A                      | Callback function triggered when the falling animation starts.                                    |
| `onAnimationEnd`   | No       | N/A                      | Callback function triggered when the falling animation ends.                                      |
| `sizeVariation`    | No       | 0                      | A value of 0.1 means flakes can vary up to 10% smaller than the base (`flakeSize`), with more flakes clustering towards the original size and fewer towards the minimum size. Recommended value is between 0 and 0.5                                    |
| `rotation`         | No       | `{ x: { min: 2π, max: 20π }, z: { min: 2π, max: 20π } }` | The rotation configuration for confetti flakes. Object with optional x and z properties, each containing optional min and max values. |
| `randomSpeed`      | No       | `{ min: 0.9, max: 1.3 }` | The random speed multiplier for confetti flakes.                                               |
| `randomOffset`     | No       | `{ x: { min: -50, max: 50 }, y: { min: 0, max: 150 } }` | The random offset for confetti flakes.                           |
| `easing`           | No       | `Easing.inOut(Easing.quad)`                    | The easing function for the animation.                                                          |
| `type`             | No       | 'default'                | The texture type for confetti flakes. Can be 'default', 'image', or 'svg'.                     |
| `flakeImage`       | No       | N/A                      | The image to use as confetti flake (required when `type` is 'image').                          |
| `flakeSvg`         | No       | N/A                      | The SVG to use as confetti flake (required when `type` is 'svg').                              |
| `radiusRange`      | No       | [0, 0]                  | The range of the radius of the confetti flakes. A tuple of [min, max] values from which a random radius will be selected for each flake (only for 'default' type). |
| `containerStyle`   | No       | N/A                      | The style of the confetti container. If you use a padding on the container, you need to set the height/width of the container to the same as the parent container. |

## `<PIConfetti />` Props

| Name               | Required | Default Value            | Description                                                                                       |
| ------------------ | -------- | ------------------------ | ------------------------------------------------------------------------------------------------- |
| `count`            | No       | 200                      | Number of confetti pieces to render.                                                              |
| `flakeSize`        | No       | { width: 8, height: 16 } | The size of each confetti flake (object with `width` and `height`).                               |
| `width`            | No       | SCREEN_WIDTH             | The width of the confetti's container.                                                            |
| `height`           | No       | SCREEN_HEIGHT            | The height of the confetti's container.                                                           |
| `blastDuration`         | No       | 300 ms                  | The duration of confetti blast (milliseconds).                                 |
| `fallDuration`         | No       | 8000 ms                  | The duration of the confetti animation in milliseconds.                                           |
| `blastPosition`         | No       | `{ x: containerWidth / 2, y: 150 }`                  | The position from which confetti flakes should blast.                                         |
| `blastRadius`         | No       | 180                  | The radius of the blast.                                        |
| `colors`           | No       | N/A                      | The array of confetti flakes colors.                                                              |
| `fadeOutOnEnd`     | No       | N/A                      | Should the confetti flakes fade out as they reach the bottom.                                     |
| `onAnimationStart` | No       | N/A                      | Callback function triggered when the falling animation starts.                                    |
| `onAnimationEnd`   | No       | N/A                      | Callback function triggered when the falling animation ends.                                      |
| `sizeVariation`    | No       | 0                      | A value of 0.1 means flakes can vary up to 10% smaller than the base (`flakeSize`), with more flakes clustering towards the original size and fewer towards the minimum size. Recommended value is between 0 and 0.5                       |
| `rotation`         | No       | `{ x: { min: π, max: 3π }, z: { min: π, max: 3π } }` | The rotation configuration for confetti flakes. Object with optional x and z properties, each containing optional min and max values. |
| `randomSpeed`      | No       | `{ min: 0.9, max: 1.3 }` | The random speed multiplier for confetti flakes.                                               |
| `randomOffset`     | No       | `{ x: { min: -50, max: 50 }, y: { min: 0, max: 150 } }` | The random offset for confetti flakes.                           |
| `type`             | No       | 'default'                | The texture type for confetti flakes. Can be 'default', 'image', or 'svg'.                     |
| `flakeImage`       | No       | N/A                      | The image to use as confetti flake (required when `type` is 'image').                          |
| `flakeSvg`         | No       | N/A                      | The SVG to use as confetti flake (required when `type` is 'svg').                              |
| `radiusRange`      | No       | [0, 0]                  | The range of the radius of the confetti flakes. A tuple of [min, max] values from which a random radius will be selected for each flake (only for 'default' type). |
| `containerStyle`   | No       | N/A                      | The style of the confetti container. If you use a padding on the container, you need to set the height/width of the container to the same as the parent container. |

## `<ContinuousConfetti />` Props

| Name               | Required | Default Value            | Description                                                                                       |
| ------------------ | -------- | ------------------------ | ------------------------------------------------------------------------------------------------- |
| `count`            | No       | 200                      | Number of confetti pieces to render.                                                              |
| `flakeSize`        | No       | { width: 8, height: 16 } | The size of each confetti flake (object with `width` and `height`).                               |
| `width`            | No       | SCREEN_WIDTH             | The width of the confetti's container.                                                            |
| `height`           | No       | SCREEN_HEIGHT            | The height of the confetti's container.                                                           |
| `fallDuration`         | No       | 8000 ms                  | The duration of confetti falling down (milliseconds).                                       |
| `blastDuration`         | No       | 300 ms                  | The duration of confetti blast (milliseconds).                                   |
| `cannonsPositions`         | No       | N/A                  | An array of positions from which confetti flakes should blast.                                  |
| `colors`           | No       | N/A                      | The array of confetti flakes colors.                                                              |
| `autoStartDelay`   | No       | 0                        | Delay before the confetti animation starts automatically (in ms).                                 |
| `verticalSpacing`  | No       | 200                       | The approximate space between confetti flakes vertically. It's recommended to set some large value e.g. 200 |
| `fadeOutOnEnd`     | No       | N/A                      | Should the confetti flakes fade out as they reach the bottom.                                     |
| `onAnimationStart` | No       | N/A                      | Callback function triggered when the falling animation starts.                                    |
| `onAnimationEnd`   | No       | N/A                      | Callback function triggered when the falling animation ends.                                      |
| `sizeVariation`    | No       | 0                      | A value of 0.1 means flakes can vary up to 10% smaller than the base (`flakeSize`), with more flakes clustering towards the original size and fewer towards the minimum size. Recommended value is between 0 and 0.5                                    |
| `rotation`         | No       | `{ x: { min: 2π, max: 20π }, z: { min: 2π, max: 20π } }` | The rotation configuration for confetti flakes. Object with optional x and z properties, each containing optional min and max values. |
| `randomSpeed`      | No       | `{ min: 1, max: 1.2 }` | The random speed multiplier for confetti flakes.                                               |
| `randomOffset`     | No       | `{ x: { min: -50, max: 50 }, y: { min: 0, max: 150 } }` | The random offset for confetti flakes.                           |
| `type`             | No       | 'default'                | The texture type for confetti flakes. Can be 'default', 'image', or 'svg'.                     |
| `flakeImage`       | No       | N/A                      | The image to use as confetti flake (required when `type` is 'image').                          |
| `flakeSvg`         | No       | N/A                      | The SVG to use as confetti flake (required when `type` is 'svg').                              |
| `radiusRange`      | No       | [0, 0]                  | The range of the radius of the confetti flakes. A tuple of [min, max] values from which a random radius will be selected for each flake (only for 'default' type). |
| `containerStyle`   | No       | N/A                      | The style of the confetti container. If you use a padding on the container, you need to set the height/width of the container to the same as the parent container. |


## Methods

| Name      | Description                                      |
| --------- | ------------------------------------------------ |
| `restart` | Start the animation from the beginning.          |
| `pause`   | Pause the animation.                             |
| `reset`   | Reset the animation and prevent it from playing. |
| `resume`  | Resume the animation from where it paused.       |

## Contributing

See the [contributing guide](CONTRIBUTING.md) to learn how to contribute to the repository and the development workflow.

## License

MIT

---

Made with [create-react-native-library](https://github.com/callstack/react-native-builder-bob)
