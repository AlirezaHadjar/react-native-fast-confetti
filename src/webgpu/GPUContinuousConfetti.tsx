import { forwardRef } from 'react';
import { InternalGPUConfetti } from './GPUConfetti';
import { Flake } from '../FlakeComponent';
import type {
  GPUConfettiMethods,
  GPUContinuousConfettiProps,
  InternalGPUConfettiProps,
} from './types';

const GPUContinuousConfettiInner = forwardRef<
  GPUConfettiMethods,
  GPUContinuousConfettiProps
>(({ verticalSpacing = 200, ...props }, ref) => (
  <InternalGPUConfetti
    {...(props as InternalGPUConfettiProps)}
    ref={ref}
    verticalSpacing={verticalSpacing}
    infinite
    continuous
  />
));

GPUContinuousConfettiInner.displayName = 'GPUContinuousConfetti';

const GPUContinuousConfetti =
  GPUContinuousConfettiInner as React.ForwardRefExoticComponent<
    GPUContinuousConfettiProps & React.RefAttributes<GPUConfettiMethods>
  > & {
    Flake: typeof Flake;
  };

GPUContinuousConfetti.Flake = Flake;

export { GPUContinuousConfetti };
