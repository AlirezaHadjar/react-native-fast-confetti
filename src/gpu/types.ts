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
  GPUTextureMode,
} from '../webgpu/types';

export type ConfettiProps = CoreConfettiProps & GPUConfettiExtraProps;
export type ContinuousConfettiProps = CoreContinuousConfettiProps &
  GPUConfettiExtraProps;
export type PIConfettiProps = CorePIConfettiProps & GPUConfettiExtraProps;
export type CannonConfettiProps = CoreCannonConfettiProps &
  GPUConfettiExtraProps;
export type ConfettiMethods = CoreConfettiMethods;
export type PIConfettiMethods = CorePIConfettiMethods;
export type CannonConfettiMethods = CoreCannonConfettiMethods;

export type {
  CannonOriginProps,
  Drag,
  FlakeProps,
  FlakeStyle,
  GPUConfettiExtraProps,
  GPUTextureMode,
  NamedPosition,
  PIOriginProps,
  Range,
  Rotation,
};
