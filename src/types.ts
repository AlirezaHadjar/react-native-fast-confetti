import type React from 'react';
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
  radius?: number;
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
  flakeSize?: FlakeSize[];
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
   * @description The style of the confetti container.
   * if you use a padding on the container, you need to set the height/width of the container to the same as the parent container.
   */
  containerStyle?: StyleProp<ViewStyle>;
};

type EasingProps = {
  /**
   * @description The easing function for the falling animation.
   * @default Easing.inOut(Easing.quad)
   */
  fallEasing?: WithTimingConfig['easing'];
  /**
   * @description The easing function for both falling and blast animations.
   * @default Easing.inOut(Easing.quad)
   * @deprecated Use `fallEasing` instead. This prop will be used as fallback if fallEasing is not provided.
   */
  easing?: WithTimingConfig['easing'];
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

export type ConfettiProps = BaseConfettiProps & TextureProps & EasingProps;
export type InternalConfettiProps = ConfettiProps & {
  isContinuous?: 1 | 2;
};

type PIBaseProps = StrictOmit<
  BaseConfettiProps,
  'autoplay' | 'verticalSpacing' | 'autoStartDelay' | 'isInfinite' | 'rotation'
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
     * @description The duration of confetti blast (milliseconds).
     * @default 300
     */
    blastDuration?: number;
    /**
     * @description The rotation configuration for confetti flakes.
     * Object with optional x and y properties, each containing optional min and max values.
     * @default { x: { min: 1 * Math.PI, max: 3 * Math.PI }, y: { min: 1 * Math.PI, max: 3 * Math.PI } }
     */
    rotation?: Rotation;
  };

type BaseContinuousConfettiProps = StrictOmit<
  BaseConfettiProps,
  'isInfinite' | 'verticalSpacing'
>;

export type ContinuousConfettiProps = BaseContinuousConfettiProps &
  TextureProps & {
    /**
     * @description The approximate space between confetti flakes vertically. It's recommended to set some large value e.g. 200
     * @default 200
     */
    verticalSpacing?: number;
  };

export type ConfettiRestartOptions = {};

export type BlastConfiguration = {
  /**
   * @description The position where this blast should originate
   */
  position: Position;
  /**
   * @description The delay in milliseconds before this blast starts (relative to restart call)
   */
  delay: number;
};

export type PIConfettiRestartOptions = {
  /**
   * @description Optional single blast position to override the prop (for backward compatibility)
   */
  blastPosition?: Position;
  /**
   * @description Optional array of blast configurations with positions and delays.
   * When provided, the total confetti count will be distributed evenly across all blasts.
   * Each blast can have its own position and delay.
   */
  blastConfigurations?: BlastConfiguration[];
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

export type NamedPosition =
  | 'bottom-left'
  | 'bottom-right'
  | 'bottom-center'
  | 'top-left'
  | 'top-right'
  | 'top-center'
  | 'center-left'
  | 'center-right'
  | 'center';

export type CannonOriginProps = {
  /**
   * @description The position of this cannon origin.
   * Can be a named position string or an explicit {x, y} coordinate.
   */
  position: NamedPosition | Position;
  /**
   * @description Number of confetti pieces for this origin.
   * @default 100
   */
  count?: number;
  /**
   * @description Launch cone width in radians.
   * @default Math.PI / 5
   */
  spread?: number;
  /**
   * @description Base launch speed (normalized to container height).
   * @default 2.0
   */
  speed?: number;
  /**
   * @description Per-piece speed multiplier range.
   * @default { min: 0.8, max: 1.2 }
   */
  speedVariation?: Range;
  /**
   * @description The array of confetti flake colors.
   */
  colors?: string[];
  /**
   * @description The rotation configuration for confetti flakes.
   */
  rotation?: Rotation;
  /**
   * @description Per-piece depth scale range to simulate 3D perspective.
   * @default { min: 1, max: 1.1 }
   */
  depth?: Range;
  /**
   * @description The target position that this cannon aims at.
   * Overrides the root-level target for this specific origin.
   * @default center-top of the container
   */
  target?: NamedPosition | Position;
  /**
   * @description Flake size variants defined as children.
   */
  children?: React.ReactNode;
};

type CannonFlakeWithSize = {
  /**
   * @description Shorthand for width and height (sets both to this value).
   */
  size: number;
  width?: never;
  height?: never;
  /**
   * @description Corner radius of the flake.
   */
  radius?: number;
};

type CannonFlakeWithDimensions = {
  size?: never;
  /**
   * @description Width of the flake.
   */
  width: number;
  /**
   * @description Height of the flake.
   */
  height: number;
  /**
   * @description Corner radius of the flake.
   */
  radius?: number;
};

export type CannonFlakeProps = CannonFlakeWithSize | CannonFlakeWithDimensions;

export type CannonConfettiRestartOptions = {
  /**
   * @description Optional array of cannon origins to override the children origins.
   * Accepts named positions or explicit {x, y} coordinates.
   */
  origins?: (NamedPosition | Position)[];
  /**
   * @description Optional array of targets corresponding to each origin.
   * Each target can be a named position or an explicit {x, y} coordinate.
   */
  targets?: (NamedPosition | Position)[];
};

type CannonConfettiBaseProps = {
  /**
   * @description Must contain at least one CannonConfetti.Origin child.
   */
  children: React.ReactNode;
  /**
   * @description Gravity constant (normalized to container height).
   * @default 3.0
   */
  gravity?: number;
  /**
   * @description Air resistance coefficient.
   * @default 2.0
   */
  drag?: number;
  /**
   * @description Whether the animation should play on mount.
   * @default true
   */
  autoplay?: boolean;
  /**
   * @description Whether the animation should play again after it ends.
   * @default false
   */
  infinite?: boolean;
  /**
   * @description Should the confetti flakes fade out as they reach the end.
   */
  fadeOutOnEnd?: boolean;
  /**
   * @description A callback that is called when the animation starts.
   */
  onAnimationStart?: () => void;
  /**
   * @description A callback that is called when the animation ends.
   */
  onAnimationEnd?: () => void;
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
   * @description The style of the confetti container.
   */
  containerStyle?: StyleProp<ViewStyle>;
  /**
   * @description Default colors for all origins. Can be overridden per-origin.
   */
  colors?: string[];
  /**
   * @description Default rotation for all origins. Can be overridden per-origin.
   */
  rotation?: Rotation;
  /**
   * @description Default depth range for all origins. Can be overridden per-origin.
   * @default { min: 1, max: 1.1 }
   */
  depth?: Range;
  /**
   * @description Default speed variation range for all origins. Can be overridden per-origin.
   * @default { min: 0.8, max: 1.2 }
   */
  speedVariation?: Range;
  /**
   * @description Default target position that all cannons aim at. Can be overridden per-origin.
   * @default center-top of the container
   */
  target?: NamedPosition | Position;
  /**
   * @description Duration in milliseconds over which confetti pieces are staggered at launch.
   * 0 means all pieces launch simultaneously (instant burst).
   */
  sprayDuration?: number;
  /**
   * @description The scale particles start at before animating to full size (1) over the first 5% of flight.
   * @default 0.3
   */
  initialScale?: number;
};

export type CannonConfettiProps = CannonConfettiBaseProps &
  (
    | {
        /**
         * @description A Skia image to use as confetti flake texture.
         */
        image: SkImage;
        svg?: never;
      }
    | {
        image?: never;
        /**
         * @description A Skia SVG to use as confetti flake texture.
         */
        svg: SkSVG;
      }
    | {
        image?: never;
        svg?: never;
      }
  );

export type CannonConfettiMethods = BaseConfettiMethods & {
  /**
   * @description start the animation from the beginning
   */
  restart: (options?: CannonConfettiRestartOptions) => void;
};
