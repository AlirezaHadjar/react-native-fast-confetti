import type { SkImage, SkSVG } from '@shopify/react-native-skia';
import type React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import type {
  EasingFunction,
  EasingFunctionFactory,
} from 'react-native-reanimated';

type StrictOmit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;

export type FlakeStyle = 'solid' | 'glossy';

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
  min: number;
  max: number;
};

export type Drag = number | { horizontal: number; vertical: number };

export type Rotation = {
  x?: Range;
  z?: Range;
};

export type FallingBox = {
  spawnX: number;
  spawnY: number;
  depthScale: number;
  clockwise: boolean;
  colorIndex: number;
  sizeIndex: number;
  spinPhase: number;
  spinRate: number;
  phaseOffset: number;
  isTextured: boolean;
};

type ConfettiBaseProps = {
  /**
   * @description Flake size variants defined as children (<Confetti.Flake>).
   */
  children?: React.ReactNode;
  /**
   * @description Number of confetti pieces to render.
   * @default 200
   */
  count?: number;
  /**
   * @description The array of confetti flake colors.
   */
  colors?: string[];
  /**
   * @description Gravity constant (normalized to container height).
   * @default 1.0
   */
  gravity?: number;
  /**
   * @description Controls how much the confetti tumble affects its trajectory.
   * Higher values create more dramatic horizontal drift and vertical bobbing.
   * At high values, pieces may momentarily stall or drift sideways.
   * @default { min: 0.03, max: 0.08 }
   */
  wobble?: Range;
  /**
   * @description Controls how much confetti pieces drift horizontally as they fall.
   * 0 means pieces fall straight down from their spawn column.
   * 1 means full physics-driven lateral displacement.
   * @default 0.7
   */
  drift?: number;
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
   * @description The delay in milliseconds before the confetti animation starts
   * automatically after mounting (only applies when `autoplay` is true).
   * @default 0
   */
  autoStartDelay?: number;
  /**
   * @description A callback that is called when the animation starts.
   */
  onAnimationStart?: () => void;
  /**
   * @description A callback that is called when the animation ends.
   */
  onAnimationEnd?: () => void;
  /**
   * @description The style of the confetti container.
   * Numeric `width` and `height` values in this style will be used for
   * physics calculations. Falls back to screen dimensions if not provided.
   */
  containerStyle?: StyleProp<ViewStyle>;
  /**
   * @description The rotation configuration for confetti flakes.
   */
  rotation?: Rotation;
  /**
   * @description Per-piece depth scale range to simulate 3D perspective.
   * @default { min: 0.8, max: 1.0 }
   */
  depth?: Range;
  /**
   * @description The approximate space between confetti flakes vertically.
   * Lower value results in denser confetti.
   * @default 70
   */
  verticalSpacing?: number;
  /**
   * @description The visual style of the default confetti flakes.
   * @default 'glossy'
   */
  flakeStyle?: FlakeStyle;
  /**
   * @description The scale particles start at before animating to full size.
   * @default 0.3
   */
  initialScale?: number;
  /**
   * @description Controls how dramatically confetti pieces flip during tumble.
   * Higher values create more dramatic flips where pieces nearly disappear edge-on.
   * Lower values (e.g. 0.1) keep pieces mostly flat, which works better for
   * image textures like money.
   * @default 0.85
   */
  flipIntensity?: number;
  /**
   * @description Custom easing function for the animation progress.
   */
  easing?: EasingFunction | EasingFunctionFactory;
};

export type ConfettiProps = ConfettiBaseProps & FlakeTexture;

export type InternalConfettiProps = ConfettiProps & {
  /** When true, uses per-piece phase offsets for a seamless continuous stream. */
  continuous?: boolean;
};

type OriginPropsBase = {
  /**
   * @description Number of confetti pieces from this origin.
   * @default 100
   */
  count?: number;
  /**
   * @description Launch cone width in radians. Full circle = 2 * Math.PI.
   * @default 2 * Math.PI
   */
  spread?: number;
  /**
   * @description Base launch speed (normalized to container height).
   * @default 1
   */
  initialSpeed?: number;
  /**
   * @description Per-piece speed multiplier range.
   * @default { min: 0.0, max: 1.0 }
   */
  speedVariation?: Range;
  /**
   * @description The array of confetti flake colors for this origin.
   */
  colors?: string[];
  /**
   * @description The rotation configuration for confetti flakes from this origin.
   */
  rotation?: Rotation;
  /**
   * @description Per-piece depth scale range to simulate 3D perspective.
   * @default { min: 1, max: 1.1 }
   */
  depth?: Range;
  /**
   * @description The visual style of default confetti flakes for this origin.
   * @default inherits from root
   */
  flakeStyle?: FlakeStyle;
  /**
   * @description Flake size variants defined as children.
   */
  children?: React.ReactNode;
};

export type PIOriginProps = OriginPropsBase & {
  /**
   * @description The position from which confetti flakes should blast.
   * Can be a named position string or an explicit {x, y} coordinate.
   */
  blastPosition: NamedPosition | Position;
  /**
   * @description Delay in milliseconds before this origin starts firing.
   * Applied on top of the root `autoStartDelay`.
   * @default 0
   */
  delay?: number;
};

type BurstConfettiBaseProps = {
  /**
   * @description Must contain at least one Origin child.
   */
  children: React.ReactNode;
  /**
   * @description Gravity constant (normalized to container height).
   * @default 3.0
   */
  gravity?: number;
  /**
   * @description Air resistance coefficient. Can be a single number applied
   * to both axes, or an object with separate `horizontal` and `vertical` values.
   * @default 3.0
   */
  drag?: Drag;
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
   * @description The delay in milliseconds before the confetti animation starts
   * automatically after mounting (only applies when `autoplay` is true).
   * @default 0
   */
  autoStartDelay?: number;
  /**
   * @description A callback that is called when the animation starts.
   */
  onAnimationStart?: () => void;
  /**
   * @description A callback that is called when the animation ends.
   */
  onAnimationEnd?: () => void;
  /**
   * @description The style of the confetti container.
   * Numeric `width` and `height` values in this style will be used for
   * physics calculations. Falls back to screen dimensions if not provided.
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
   * @default { min: 0.0, max: 1.0 }
   */
  speedVariation?: Range;
  /**
   * @description Duration in milliseconds over which confetti pieces are staggered at launch.
   * 0 means all pieces launch simultaneously (instant burst).
   */
  sprayDuration?: number;
  /**
   * @description The scale particles start at before animating to full size.
   * @default 0.3
   */
  initialScale?: number;
  /**
   * @description The visual style of the default confetti flakes.
   * @default 'glossy'
   */
  flakeStyle?: FlakeStyle;
  /**
   * @description Controls how dramatically confetti pieces flip during tumble.
   * Higher values create more dramatic flips where pieces nearly disappear edge-on.
   * Lower values (e.g. 0.1) keep pieces mostly flat, which works better for
   * image textures.
   * @default 0.85
   */
  flipIntensity?: number;
  /**
   * @description Custom easing function for the animation progress.
   */
  easing?: EasingFunction | EasingFunctionFactory;
};

type PIConfettiBaseProps = BurstConfettiBaseProps;

export type PIConfettiProps = PIConfettiBaseProps & FlakeTexture;

export type ContinuousConfettiProps = StrictOmit<
  ConfettiProps,
  'infinite' | 'onAnimationEnd' | 'fadeOutOnEnd'
>;

export type PIConfettiRestartOptions = {
  /**
   * @description Optional array of origins to override positions and delays.
   */
  origins?: {
    blastPosition: NamedPosition | Position;
    delay?: number;
  }[];
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
  restart: () => void;
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

export type CannonOriginProps = OriginPropsBase & {
  /**
   * @description The position of this cannon origin.
   * Can be a named position string or an explicit {x, y} coordinate.
   */
  position: NamedPosition | Position;
  /**
   * @description The target position that this cannon aims at.
   * Overrides the root-level target for this specific origin.
   * @default center-top of the container
   */
  target?: NamedPosition | Position;
};

type FlakeSizeShorthand = {
  /**
   * @description Shorthand for width and height (sets both to this value).
   */
  size: number;
  width?: never;
  height?: never;
};

type FlakeSizeExplicit = {
  size?: never;
  /**
   * @description Width of the flake.
   */
  width: number;
  /**
   * @description Height of the flake.
   */
  height: number;
};

type FlakeBase = {
  /**
   * @description Corner radius of the flake.
   */
  radius?: number;
  /**
   * @description The visual style of this flake.
   * Overrides the origin-level and root-level flakeStyle.
   * @default inherits from origin or root
   */
  flakeStyle?: FlakeStyle;
  /**
   * @description Custom color palette for this flake group.
   * Overrides the parent-level colors for confetti pieces using this flake variant.
   */
  colors?: string[];
};

type FlakeTexture =
  | {
      /**
       * @description A Skia image to use as this flake's texture.
       */
      image: SkImage;
      svg?: never;
    }
  | {
      image?: never;
      /**
       * @description A Skia SVG to use as this flake's texture.
       */
      svg: SkSVG;
    }
  | {
      image?: never;
      svg?: never;
    };

export type FlakeProps = (FlakeSizeShorthand | FlakeSizeExplicit) &
  FlakeBase &
  FlakeTexture;

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

type CannonConfettiBaseProps = BurstConfettiBaseProps & {
  /**
   * @description Default target position that all cannons aim at. Can be overridden per-origin.
   * @default center-top of the container
   */
  target?: NamedPosition | Position;
};

export type CannonConfettiProps = CannonConfettiBaseProps & FlakeTexture;

export type CannonConfettiMethods = BaseConfettiMethods & {
  /**
   * @description start the animation from the beginning
   */
  restart: (options?: CannonConfettiRestartOptions) => void;
};
