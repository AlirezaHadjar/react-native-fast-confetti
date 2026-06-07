import { forwardRef } from 'react';
import { InternalConfetti } from './GPUConfetti';
import { Flake } from '../FlakeComponent';
import type {
  GPUConfettiMethods,
  GPUContinuousConfettiProps,
  InternalGPUConfettiProps,
} from './types';

const ContinuousConfettiInner = forwardRef<
  GPUConfettiMethods,
  GPUContinuousConfettiProps
>(({ verticalSpacing = 200, ...props }, ref) => (
  <InternalConfetti
    {...(props as InternalGPUConfettiProps)}
    ref={ref}
    verticalSpacing={verticalSpacing}
    infinite
    continuous
  />
));

ContinuousConfettiInner.displayName = 'ContinuousConfetti';

const ContinuousConfetti =
  ContinuousConfettiInner as React.ForwardRefExoticComponent<
    GPUContinuousConfettiProps & React.RefAttributes<GPUConfettiMethods>
  > & {
    Flake: typeof Flake;
  };

ContinuousConfetti.Flake = Flake;

export { ContinuousConfetti };
