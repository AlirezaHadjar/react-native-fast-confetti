import type {
  CannonConfettiMethods as CoreCannonConfettiMethods,
  CannonConfettiProps as CoreCannonConfettiProps,
  CannonOriginProps,
  ConfettiMethods as CoreConfettiMethods,
  ConfettiProps as CoreConfettiProps,
  ContinuousConfettiProps as CoreContinuousConfettiProps,
  Drag,
  OpacityAnimation,
  OpacityKeyframes,
  FlakeProps,
  FlakeStyle,
  NamedPosition,
  PIConfettiMethods as CorePIConfettiMethods,
  PIConfettiProps as CorePIConfettiProps,
  PIOriginProps,
  Range,
  Rotation,
} from '../types';
import type {
  GPUConfettiExtraProps,
  GPUDeviceProps,
  GPUFloorProps,
  GPUTextureMode,
  SettleOnFloorConfig,
} from '../webgpu/types';

export type ConfettiProps = CoreConfettiProps &
  GPUConfettiExtraProps &
  GPUDeviceProps;
export type ContinuousConfettiProps = CoreContinuousConfettiProps &
  Omit<GPUConfettiExtraProps, 'settleOnFloor'> &
  GPUDeviceProps;
export type PIConfettiProps = CorePIConfettiProps &
  GPUFloorProps &
  GPUDeviceProps;
export type CannonConfettiProps = CoreCannonConfettiProps &
  GPUFloorProps &
  GPUDeviceProps;
export type ConfettiMethods = CoreConfettiMethods;
export type PIConfettiMethods = CorePIConfettiMethods;
export type CannonConfettiMethods = CoreCannonConfettiMethods;

export type {
  CannonOriginProps,
  Drag,
  OpacityAnimation,
  OpacityKeyframes,
  FlakeProps,
  FlakeStyle,
  GPUConfettiExtraProps,
  GPUDeviceProps,
  GPUFloorProps,
  GPUTextureMode,
  SettleOnFloorConfig,
  NamedPosition,
  PIOriginProps,
  Range,
  Rotation,
};
