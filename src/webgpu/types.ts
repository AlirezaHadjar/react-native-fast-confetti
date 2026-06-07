import type { SharedValue } from 'react-native-reanimated';
import type {
  ConfettiMethods,
  ConfettiProps,
  ContinuousConfettiProps,
  InternalConfettiProps,
} from '../types';

export type GPUTextureMode =
  | 0 // default
  | 1 // wood
  | 2 // rubber
  | 3 // gold
  | 4 // holographic
  | 5 // marble
  | 6 // neon
  | 7; // glass

export type GPUConfettiExtraProps = {
  /**
   * Strength of the procedural wind field.
   * @default 0
   */
  windStrength?: number;
  /**
   * Strength of spin-driven lateral force.
   * @default 0
   */
  magnusStrength?: number;
  /**
   * Stretch amount applied along particle velocity.
   * @default 0
   */
  motionBlurAmount?: number;
  /**
   * Reserved for future floor collision support.
   * @default 0.3
   */
  bounceRestitution?: number;
  /**
   * Reserved for future floor collision support.
   * @default 0.92
   */
  floorFriction?: number;
  /**
   * Reserved for shader shadow intensity.
   * @default 0.35
   */
  shadowOpacity?: number;
  /**
   * Intensity of shader rim iridescence.
   * @default 0
   */
  iridescence?: number;
  /**
   * Procedural material mode for non-textured flakes.
   * 0=default, 1=wood, 2=rubber, 3=gold, 4=holographic, 5=marble, 6=neon, 7=glass.
   * @default 0
   */
  textureMode?: GPUTextureMode;
  /**
   * When false, the GPU simulation keeps running until manually restarted.
   * Useful when gravity is driven by device motion.
   * @default true
   */
  autoRestart?: boolean;
  /**
   * Optional normalized gravity direction. Use a shared value for sensor-driven gravity.
   * @default [0, 1, 0]
   */
  gravityDir?: SharedValue<[number, number, number]>;
};

export type GPUConfettiProps = ConfettiProps & GPUConfettiExtraProps;
export type InternalGPUConfettiProps = InternalConfettiProps &
  GPUConfettiExtraProps;
export type GPUContinuousConfettiProps = ContinuousConfettiProps &
  GPUConfettiExtraProps;
export type GPUConfettiMethods = ConfettiMethods;
