import { InternalConfetti } from './Confetti';
import type { ConfettiMethods, ContinuousConfettiProps } from './types';
import { useRef, useImperativeHandle, forwardRef } from 'react';

/**
 * ContinuousConfetti: Uses two staggered Confetti instances to create
 * an uninterrupted stream of confetti. Will be migrated to the new
 * physics-based API in a future update.
 */
export const ContinuousConfetti = forwardRef<
  ConfettiMethods,
  ContinuousConfettiProps
>((props, ref) => {
  const confettiRef1 = useRef<ConfettiMethods>(null);
  const confettiRef2 = useRef<ConfettiMethods>(null);

  useImperativeHandle(ref, () => ({
    restart: () => {
      confettiRef1.current?.restart();
      confettiRef2.current?.restart();
    },
    pause: () => {
      confettiRef1.current?.pause();
      confettiRef2.current?.pause();
    },
    reset: () => {
      confettiRef1.current?.reset();
      confettiRef2.current?.reset();
    },
    resume: () => {
      confettiRef1.current?.resume();
      confettiRef2.current?.resume();
    },
  }));

  // Note: ContinuousConfetti currently does not produce a seamless
  // stream with the physics-based engine. It runs two infinite instances
  // side-by-side as a temporary measure. A proper continuous mode will
  // be implemented in a follow-up.
  return (
    <>
      <InternalConfetti
        {...(props as any)}
        ref={confettiRef1}
        infinite
      />
      <InternalConfetti
        {...(props as any)}
        ref={confettiRef2}
        infinite
        phaseOffset={0.5}
      />
    </>
  );
});

ContinuousConfetti.displayName = 'ContinuousConfetti';
