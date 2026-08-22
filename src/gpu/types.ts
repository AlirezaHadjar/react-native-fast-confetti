import type {
  CannonConfettiMethods as CoreCannonConfettiMethods,
  CannonConfettiProps as CoreCannonConfettiProps,
  CannonOriginProps,
  ConfettiMethods as CoreConfettiMethods,
  ConfettiProps as CoreConfettiProps,
  ContinuousConfettiProps as CoreContinuousConfettiProps,
  Drag,
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
  GPUTextureMode,
} from '../webgpu/types';

export type ConfettiProps = CoreConfettiProps &
  GPUConfettiExtraProps &
  GPUDeviceProps;
export type ContinuousConfettiProps = CoreContinuousConfettiProps &
  GPUConfettiExtraProps &
  GPUDeviceProps;
export type PIConfettiProps = CorePIConfettiProps & GPUDeviceProps;
export type CannonConfettiProps = CoreCannonConfettiProps & GPUDeviceProps;
export type ConfettiMethods = CoreConfettiMethods;
export type PIConfettiMethods = CorePIConfettiMethods;
export type CannonConfettiMethods = CoreCannonConfettiMethods;

export type {
  CannonOriginProps,
  Drag,
  FlakeProps,
  FlakeStyle,
  GPUConfettiExtraProps,
  GPUDeviceProps,
  GPUTextureMode,
  NamedPosition,
  PIOriginProps,
  Range,
  Rotation,
};
