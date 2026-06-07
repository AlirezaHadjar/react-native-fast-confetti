import type {
  CannonConfettiMethods as CoreCannonConfettiMethods,
  CannonConfettiProps as CoreCannonConfettiProps,
  CannonOriginProps as CoreCannonOriginProps,
  ConfettiMethods as CoreConfettiMethods,
  ConfettiProps as CoreConfettiProps,
  ContinuousConfettiProps as CoreContinuousConfettiProps,
  PIConfettiMethods as CorePIConfettiMethods,
  PIConfettiProps as CorePIConfettiProps,
  PIOriginProps as CorePIOriginProps,
} from '../types';
import type {
  CannonConfettiMethods,
  CannonConfettiProps,
  CannonOriginProps,
  ConfettiMethods,
  ConfettiProps,
  ContinuousConfettiProps,
  PIConfettiMethods,
  PIConfettiProps,
  PIOriginProps,
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

export type AssertGpuPIConfettiPropsIncludeCore =
  AssertNever<MissingKeys<CorePIConfettiProps, PIConfettiProps>>;

export type AssertGpuPIConfettiPropsMatchCore =
  AssertNever<IncompatibleKeys<CorePIConfettiProps, PIConfettiProps>>;

export type AssertGpuCannonConfettiPropsIncludeCore =
  AssertNever<MissingKeys<CoreCannonConfettiProps, CannonConfettiProps>>;

export type AssertGpuCannonConfettiPropsMatchCore =
  AssertNever<IncompatibleKeys<CoreCannonConfettiProps, CannonConfettiProps>>;

export type AssertGpuPIConfettiMethodsIncludeCore =
  AssertNever<MissingKeys<CorePIConfettiMethods, PIConfettiMethods>>;

export type AssertGpuCannonConfettiMethodsIncludeCore =
  AssertNever<MissingKeys<CoreCannonConfettiMethods, CannonConfettiMethods>>;

export type AssertGpuPIOriginPropsIncludeCore =
  AssertNever<MissingKeys<CorePIOriginProps, PIOriginProps>>;

export type AssertGpuPIOriginPropsMatchCore =
  AssertNever<IncompatibleKeys<CorePIOriginProps, PIOriginProps>>;

export type AssertGpuCannonOriginPropsIncludeCore =
  AssertNever<MissingKeys<CoreCannonOriginProps, CannonOriginProps>>;

export type AssertGpuCannonOriginPropsMatchCore =
  AssertNever<IncompatibleKeys<CoreCannonOriginProps, CannonOriginProps>>;

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

export const implementedPIConfettiProps = {
  autoStartDelay: true,
  autoplay: true,
  children: true,
  colors: true,
  containerStyle: true,
  depth: true,
  drag: true,
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
  speedVariation: true,
  sprayDuration: true,
  svg: true,
} satisfies Record<AllKeys<CorePIConfettiProps>, true>;

export const implementedCannonConfettiProps = {
  autoStartDelay: true,
  autoplay: true,
  children: true,
  colors: true,
  containerStyle: true,
  depth: true,
  drag: true,
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
  speedVariation: true,
  sprayDuration: true,
  svg: true,
  target: true,
} satisfies Record<AllKeys<CoreCannonConfettiProps>, true>;

export const implementedPIConfettiMethods = {
  pause: true,
  reset: true,
  restart: true,
  resume: true,
} satisfies Record<AllKeys<CorePIConfettiMethods>, true>;

export const implementedCannonConfettiMethods = {
  pause: true,
  reset: true,
  restart: true,
  resume: true,
} satisfies Record<AllKeys<CoreCannonConfettiMethods>, true>;

export const implementedPIOriginProps = {
  blastPosition: true,
  children: true,
  colors: true,
  count: true,
  delay: true,
  depth: true,
  flakeStyle: true,
  initialSpeed: true,
  rotation: true,
  speedVariation: true,
  spread: true,
} satisfies Record<AllKeys<CorePIOriginProps>, true>;

export const implementedCannonOriginProps = {
  children: true,
  colors: true,
  count: true,
  depth: true,
  flakeStyle: true,
  initialSpeed: true,
  position: true,
  rotation: true,
  speedVariation: true,
  spread: true,
  target: true,
} satisfies Record<AllKeys<CoreCannonOriginProps>, true>;
