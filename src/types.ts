import type { SkImage, SkSVG } from '@shopify/react-native-skia';
import type { StyleProp, ViewStyle } from 'react-native';
import type { WithTimingConfig } from 'react-native-reanimated';

type StrictOmit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;

/**
 * Utility type that recursively makes all optional properties required (including nested ones)
 */
export type DeepRequired<T> = {
  [K in keyof T]: Required<DeepRequired<T[K]>>;
};

export type FlakeSize = {
  width: number;
  height: number;
};

export type Position = {
  x: number;
  y: number;
};

export type Range = {
  min?: number;
  max?: number;
};

export type Rotation = {
  x?: Range;
  z?: Range;
};

export type RandomOffset = {
  x?: Range;
  y?: Range;
};

type BaseConfettiProps = {
  /**
   * @description number of confetti pieces to render.
   * @default 200
   */
  count?: number;
  /**
   * @description the size confetti's flake.
   */
  flakeSize?: FlakeSize;
  /**
   * @description The width of the confetti's container.
   * @default SCREEN_WIDTH
   */
  width?: number;
  /**
   * @description The height of the confetti's container.
   * @default SCREEN_HEIGHT
   */
  height?: number;
  /**
   * @description The duration of confetti falling down (milliseconds).
   * @default 8000
   */
  fallDuration?: number;
  /**
   * @description The duration of confetti blast (milliseconds).
   * @default 300
   */
  blastDuration?: number;
  /**
   * @description Wether the animation should play on mount.
   * @default true
   */
  autoplay?: boolean;
  /**
   * @description Wether the animation should play again after it ends.
   * @default true
   */
  isInfinite?: boolean;
  /**
   * @description The array of confetti flakes color.
   */
  colors?: string[];
  /**
   * @description The delay in milliseconds before the confetti animation starts automatically after initialization.
   * @default 0
   */
  autoStartDelay?: number;
  /**
   * @description Should the confetti flakes fade out as they reach the bottom.
   */
  fadeOutOnEnd?: boolean;
  /**
   * @description The approximate space between confetti flakes vertically. Lower value results in denser confetti.
   * @default 30
   */
  verticalSpacing?: number;
  /**
   * @description A callback that is called when the falling animation starts.
   */
  onAnimationStart?: () => void;
  /**
   * @description A callback that is called when the falling animation starts.
   */
  onAnimationEnd?: () => void;
  /**
   * @description An array of positions from which confetti flakes should blast.
   */
  cannonsPositions?: Position[];
  /**
   * @description Controls the random size variation of confetti flakes. Value between 0 and 1.
   * A value of 0.1 means flakes can vary up to 10% smaller than the base size, with more flakes
   * clustering towards the original size and fewer towards the minimum size.
   * Recommended value is between 0 and 0.5
   * @default 0
   */
  sizeVariation?: number;
  /**
   * @description The rotation configuration for confetti flakes.
   * Object with optional x and y properties, each containing optional min and max values.
   * @default { x: { min: 2 * Math.PI, max: 20 * Math.PI }, y: { min: 2 * Math.PI, max: 20 * Math.PI } }
   */
  rotation?: Rotation;

  /**
   * @description The random speed multiplier for confetti flakes.
   * @default { min: 0.9, max: 1.3 }
   */
  randomSpeed?: Range;

  /**
   * @description The random offset for confetti flakes.
   * @default { x: { min: -50, max: 50 }, y: { min: 0, max: 150 } }
   */
  randomOffset?: RandomOffset;
  /**
   * @description The random speed multiplier for confetti flakes.
   * @default { min: 0.9, max: 1.3 }
   */
  easing?: WithTimingConfig['easing'];

  /**
   * @description The style of the confetti container.
   * if you use a padding on the container, you need to set the height/width of the container to the same as the parent container.
   */
  containerStyle?: StyleProp<ViewStyle>;
};

type TextureProps =
  | {
      /**
       * @description Use this to render images as confetti flakes.
       */
      type: 'image';
      /**
       * @description The image to use as confetti flake.
       */
      flakeImage: SkImage;
    }
  | {
      /**
       * @description Use this to render custom SVGs as confetti flakes.
       */
      type: 'svg';
      /**
       * @description The SVG to use as confetti flake.
       */
      flakeSvg: SkSVG;
    }
  | {
      /**
       * @description Use this to render default confetti flakes.
       */
      type?: 'default';

      /**
       * @description The range of the radius of the confetti flakes.
       * A tuple of [min, max] values from which a random radius will be selected for each flake.
       * @default '[0, 0]'
       */
      radiusRange?: [number, number];
    };

export type ConfettiProps = BaseConfettiProps & TextureProps;
export type InternalConfettiProps = ConfettiProps & {
  isContinuous?: 1 | 2;
};

type PIBaseProps = StrictOmit<
  BaseConfettiProps,
  | 'autoplay'
  | 'verticalSpacing'
  | 'autoStartDelay'
  | 'cannonsPositions'
  | 'isInfinite'
  | 'rotation'
>;

export type PIConfettiProps = PIBaseProps &
  TextureProps & {
    /**
     * @description The position from which confetti flakes should blast.
     * @default { x: containerWidth / 2, y: 150 }
     */
    blastPosition?: Position;
    /**
     * @description The radius of the blast.
     * @default 180
     */
    blastRadius?: number;
    /**
     * @description The rotation configuration for confetti flakes.
     * Object with optional x and y properties, each containing optional min and max values.
     * @default { x: { min: 1 * Math.PI, max: 3 * Math.PI }, y: { min: 1 * Math.PI, max: 3 * Math.PI } }
     */
    rotation?: Rotation;
  };

type BaseContinuousConfettiProps = StrictOmit<
  BaseConfettiProps,
  'isInfinite' | 'easing' | 'verticalSpacing'
>;

export type ContinuousConfettiProps = BaseContinuousConfettiProps &
  TextureProps & {
    /**
     * @description The approximate space between confetti flakes vertically. It's recommended to set some large value e.g. 200
     * @default 200
     */
    verticalSpacing?: number;
  };

export type ConfettiRestartOptions = {
  /**
   * @description Optional array of cannon positions to override the prop
   */
  cannonsPositions?: Position[];
};

export type PIConfettiRestartOptions = {
  /**
   * @description Optional array of cannon positions to override the prop
   */
  blastPosition?: Position;
};

type BaseConfettiMethods = {
  /**
   * @description pause the animation
   */
  pause: () => void;
  /**
   * @description reset the animation and not play it
   */
  reset: () => void;
  /**
   * @description resume the animation from where it paused
   */
  resume: () => void;
};

export type ConfettiMethods = BaseConfettiMethods & {
  /**
   * @description start the animation from the beginning
   */
  restart: (options?: ConfettiRestartOptions) => void;
};

export type PIConfettiMethods = BaseConfettiMethods & {
  /**
   * @description start the animation from the beginning
   */
  restart: (options?: PIConfettiRestartOptions) => void;
};
