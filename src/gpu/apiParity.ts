import type {
  ConfettiMethods as CoreConfettiMethods,
  ConfettiProps as CoreConfettiProps,
  ContinuousConfettiProps as CoreContinuousConfettiProps,
} from '../types';
import type {
  ConfettiMethods,
  ConfettiProps,
  ContinuousConfettiProps,
} from './types';

type AllKeys<T> = T extends unknown ? keyof T : never;
type MissingKeys<Base, Candidate> = Exclude<AllKeys<Base>, AllKeys<Candidate>>;
type IncompatibleKeys<Base, Candidate> = {
  [K in AllKeys<Base> & AllKeys<Candidate>]: Base[K] extends Candidate[K]
    ? never
    : K;
}[AllKeys<Base> & AllKeys<Candidate>];
type AssertNever<T extends never> = T;

export type AssertGpuConfettiPropsIncludeCore =
  AssertNever<MissingKeys<CoreConfettiProps, ConfettiProps>>;

export type AssertGpuConfettiPropsMatchCore =
  AssertNever<IncompatibleKeys<CoreConfettiProps, ConfettiProps>>;

export type AssertGpuContinuousConfettiPropsIncludeCore = AssertNever<
  MissingKeys<CoreContinuousConfettiProps, ContinuousConfettiProps>
>;

export type AssertGpuContinuousConfettiPropsMatchCore = AssertNever<
  IncompatibleKeys<CoreContinuousConfettiProps, ContinuousConfettiProps>
>;

export type AssertGpuConfettiMethodsIncludeCore =
  AssertNever<MissingKeys<CoreConfettiMethods, ConfettiMethods>>;

export const implementedConfettiProps = {
  autoStartDelay: true,
  autoplay: true,
  children: true,
  colors: true,
  containerStyle: true,
  count: true,
  depth: true,
  drift: true,
  easing: true,
  fadeOutOnEnd: true,
  flakeStyle: true,
  flipIntensity: true,
  gravity: true,
  image: true,
  infinite: true,
  initialScale: true,
  onAnimationEnd: true,
  onAnimationStart: true,
  rotation: true,
  svg: true,
  verticalSpacing: true,
  wobble: true,
} satisfies Record<AllKeys<CoreConfettiProps>, true>;

export const implementedContinuousConfettiProps = {
  autoStartDelay: true,
  autoplay: true,
  children: true,
  colors: true,
  containerStyle: true,
  count: true,
  depth: true,
  drift: true,
  easing: true,
  flakeStyle: true,
  flipIntensity: true,
  gravity: true,
  image: true,
  initialScale: true,
  onAnimationStart: true,
  rotation: true,
  svg: true,
  verticalSpacing: true,
  wobble: true,
} satisfies Record<AllKeys<CoreContinuousConfettiProps>, true>;

export const implementedConfettiMethods = {
  pause: true,
  reset: true,
  restart: true,
  resume: true,
} satisfies Record<AllKeys<CoreConfettiMethods>, true>;
