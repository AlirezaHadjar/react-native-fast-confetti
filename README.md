# react-native-fast-confetti 🎊

🏎️ The fastest confetti animation library in react native written using Skia Atlas API

https://github.com/user-attachments/assets/968a376f-f20c-4a94-886b-65b1625891ae

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
import { PIConfetti } from 'react-native-fast-confetti';

// ...

return (
    <View>
    {...Your other components}
    <PIConfetti />
    {...Your other components}
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
| `sizeVariation`    | No       | 0                      | Controls the random size variation of confetti flakes. Value between 0 and 1. A value of 0.1 means flakes can randomly vary between 10% smaller to 10% larger than the base size (`flakeSize`). Recommended value is between 0 and 0.2                                     |

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
| `sizeVariation`    | No       | 0                      | Controls the random size variation of confetti flakes. Value between 0 and 1. A value of 0.1 means flakes can randomly vary between 10% smaller to 10% larger than the base size (`flakeSize`). Recommended value is between 0 and 0.2                                     |


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
