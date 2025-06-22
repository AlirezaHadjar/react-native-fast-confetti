import { Easing } from 'react-native-reanimated';
import { InternalConfetti } from './Confetti';
import {
  CONTINUOUS_CONFETTI_RANDOM_OFFSET,
  CONTINUOUS_CONFETTI_RANDOM_SPEED,
} from './constants';
import type { ConfettiMethods, ContinuousConfettiProps } from './types';
import type { FC, RefObject } from 'react';
import { useRef, useImperativeHandle } from 'react';

type Props = ContinuousConfettiProps & {
  ref?: RefObject<ConfettiMethods | null>;
};

export const ContinuousConfetti: FC<Props> = ({ ref, ...props }) => {
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

  return (
    <>
      <InternalConfetti
        randomSpeed={CONTINUOUS_CONFETTI_RANDOM_SPEED}
        randomOffset={CONTINUOUS_CONFETTI_RANDOM_OFFSET}
        {...props}
        ref={confettiRef1}
        isInfinite
        isContinuous={1}
        easing={Easing.linear}
      />
      <InternalConfetti
        randomSpeed={CONTINUOUS_CONFETTI_RANDOM_SPEED}
        randomOffset={CONTINUOUS_CONFETTI_RANDOM_OFFSET}
        {...props}
        ref={confettiRef2}
        isInfinite
        isContinuous={2}
        easing={Easing.linear}
      />
    </>
  );
};
