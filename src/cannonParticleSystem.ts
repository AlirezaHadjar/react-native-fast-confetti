import type { CannonParticle } from './types';

export type CannonParticleState = {
  x: number;
  y: number;
  rotation: number;
  rotationX: number;
  flipDepth: number;
  size: number;
};

export const projectCannonParticleHeight = (
  rotationX: number,
  flipDepth: number
): number => {
  'worklet';
  const safeDepth = Math.min(Math.max(flipDepth, 0), 1);
  const cosine = Math.cos(rotationX);
  if (safeDepth >= 0.999) return cosine;
  return 1 - safeDepth * (1 - Math.abs(cosine));
};

const dampedDisplacement = (
  velocity: number,
  drag: number,
  time: number
): number => {
  'worklet';
  const safeDrag = Math.max(drag, 0.001);
  return (velocity * (1 - Math.exp(-safeDrag * time))) / safeDrag;
};

export const evaluateCannonParticle = (
  particle: CannonParticle,
  systemTime: number
): CannonParticleState | null => {
  'worklet';
  const age = (systemTime - particle.startTime) / 1000;
  if (age < 0) return null;

  const safeVerticalDrag = Math.max(particle.verticalDrag, 0.001);
  const verticalDecay = 1 - Math.exp(-safeVerticalDrag * age);
  const verticalDisplacement =
    (particle.gravity / safeVerticalDrag) * age +
    ((particle.velocityY - particle.gravity / safeVerticalDrag) /
      safeVerticalDrag) *
      verticalDecay;
  return {
    x:
      particle.x +
      dampedDisplacement(particle.velocityX, particle.horizontalDrag, age),
    y: particle.y + verticalDisplacement,
    rotation: particle.rotation + particle.angularVelocity * age,
    rotationX: particle.rotationX + particle.angularVelocityX * age,
    flipDepth: particle.flipDepth,
    size: particle.size,
  };
};
