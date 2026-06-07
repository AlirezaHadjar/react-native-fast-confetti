import type {
  ConfettiMethods as CoreConfettiMethods,
  ConfettiProps as CoreConfettiProps,
  ContinuousConfettiProps as CoreContinuousConfettiProps,
  Drag,
  FlakeProps,
  FlakeStyle,
  NamedPosition,
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
export type ConfettiMethods = CoreConfettiMethods;

export type {
  Drag,
  FlakeProps,
  FlakeStyle,
  GPUConfettiExtraProps,
  GPUTextureMode,
  NamedPosition,
  Range,
  Rotation,
};
