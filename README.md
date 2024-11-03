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

## Props

| Name               | Required | Default Value            | Description                                                                                       |
| ------------------ | -------- | ------------------------ | ------------------------------------------------------------------------------------------------- |
| `count`            | No       | 200                      | Number of confetti pieces to render.                                                              |
| `flakeSize`        | No       | { width: 8, height: 16 } | The size of each confetti flake (object with `width` and `height`).                               |
| `width`            | No       | SCREEN_WIDTH             | The width of the confetti's container.                                                            |
| `height`           | No       | SCREEN_HEIGHT            | The height of the confetti's container.                                                           |
| `duration`         | No       | 8000 ms                  | The duration of the confetti animation in milliseconds.                                           |
| `autoplay`         | No       | true                     | Whether the animation should play on mount.                                                       |
| `isInfinite`       | No       | follows `autoplay`       | Wether the animation should play again after it ends.                                             |
| `colors`           | No       | N/A                      | The array of confetti flakes colors.                                                              |
| `autoStartDelay`   | No       | 0                        | Delay before the confetti animation starts automatically (in ms).                                 |
| `verticalSpacing`  | No       | 30                       | The approximate space between confetti flakes vertically. Lower value results in denser confetti. |
| `fadeOutOnEnd`     | No       | N/A                      | Should the confetti flakes fade out as they reach the bottom.                                     |
| `onAnimationStart` | No       | N/A                      | Callback function triggered when the falling animation starts.                                    |
| `onAnimationEnd`   | No       | N/A                      | Callback function triggered when the falling animation ends.                                      |

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
