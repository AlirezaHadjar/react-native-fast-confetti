import { forwardRef } from 'react';
import { InternalConfetti } from './Confetti';
import { Flake } from './FlakeComponent';
import type {
  ConfettiMethods,
  ContinuousConfettiProps,
  InternalConfettiProps,
} from './types';

const ContinuousConfettiInner = forwardRef<
  ConfettiMethods,
  ContinuousConfettiProps
>(({ verticalSpacing = 200, ...props }, ref) => (
  <InternalConfetti
    {...(props as InternalConfettiProps)}
    ref={ref}
    verticalSpacing={verticalSpacing}
    infinite
    continuous
  />
));

ContinuousConfettiInner.displayName = 'ContinuousConfetti';

const ContinuousConfetti = ContinuousConfettiInner as React.ForwardRefExoticComponent<
  ContinuousConfettiProps & React.RefAttributes<ConfettiMethods>
> & {
  Flake: typeof Flake;
};

ContinuousConfetti.Flake = Flake;

export { ContinuousConfetti };
