import type { SharedValue } from 'react-native-reanimated';
import type {
  CannonConfettiMethods,
  CannonConfettiProps,
  ConfettiMethods,
  ConfettiProps,
  ContinuousConfettiProps,
  InternalConfettiProps,
  PIConfettiMethods,
  PIConfettiProps,
} from '../types';
import type { FixedLengthArray } from '../typeHelpers';

export type GPUTextureMode =
  | 0 // default
  | 1 // wood
  | 2 // rubber
  | 3 // gold
  | 4 // holographic
  | 5 // marble
  | 6 // neon
  | 7; // glass

export type GPUDeviceProps = {
  /**
   * An optional GPUDevice borrowed from the host application.
   * When omitted, all GPU confetti components lazily share one internal device.
   * The library never destroys an injected device.
   */
  device?: GPUDevice;
  /**
   * Android transparent canvas composition mode.
   * TextureView follows screen transitions, clipping, and regular view stacking.
   * Use `surface-overlay` for a topmost effect whose host manages navigation.
   * @default 'texture'
   */
  androidTransparencyMode?: 'texture' | 'surface-overlay';
  /** Reports GPU device acquisition and renderer resource failures. */
  onError?: (error: unknown) => void;
};

export type SettleOnFloorConfig = {
  /** @default true */
  enabled?: boolean;
  /** Fraction of vertical speed retained after impact. @default 0.3 */
  restitution?: number;
  /** Fraction of tangential velocity and spin retained after impact. @default 0.92 */
  friction?: number;
  /** Per-particle variation applied to restitution and friction. @default 0 */
  variation?: number;
};

export type GPUFloorProps = {
  /** Keep finite or looping batches on a simulated floor. */
  settleOnFloor?: SettleOnFloorConfig;
};

export type GPUConfettiExtraProps = GPUFloorProps & {
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
   * Reserved for future shader shadow intensity.
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
  gravityDir?: SharedValue<FixedLengthArray<number, 3>>;
};

export type GPUConfettiProps = ConfettiProps &
  GPUConfettiExtraProps &
  GPUDeviceProps;
export type InternalGPUConfettiProps = InternalConfettiProps &
  GPUConfettiExtraProps &
  GPUDeviceProps;
export type GPUContinuousConfettiProps = ContinuousConfettiProps &
  Omit<GPUConfettiExtraProps, 'settleOnFloor'> &
  GPUDeviceProps;
export type GPUPIConfettiProps = PIConfettiProps &
  GPUFloorProps &
  GPUDeviceProps;
export type GPUCannonConfettiProps = CannonConfettiProps &
  GPUFloorProps &
  GPUDeviceProps;
export type GPUConfettiMethods = ConfettiMethods;
export type GPUPIConfettiMethods = PIConfettiMethods;
export type GPUCannonConfettiMethods = CannonConfettiMethods;
