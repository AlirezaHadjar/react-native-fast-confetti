import { describe, expect, it } from '@jest/globals';
import type { SkImage } from '@shopify/react-native-skia';
import { d, tgpu } from 'typegpu';

import type { SizeVariation } from '../hooks/useConfettiFlakes';
import type { CannonConfig, PIConfig } from '../utils';
import {
  toCannonBurstOrigins,
  toPIBurstOrigins,
} from '../webgpu/burstResourcePacking';
import {
  canUseTextureOnlyPipeline,
  computeSizeFlags,
  createPhasePermutation,
  SIZE_FLAG_MASK_LAYER_SHIFT,
  SIZE_FLAG_TEXTURE_LAYER_SHIFT,
  toInitSizeInputs,
} from '../webgpu/resourcePacking';
import {
  burstConfettiInit,
  burstConfettiTransform,
  burstTextureFragment,
  createBurstConfettiPipelines,
} from '../webgpu/shaders/burstConfetti';
import {
  createConfettiPipelines,
  confettiInit,
  confettiTextureFragment,
  confettiVertex,
} from '../webgpu/shaders/confetti';
import {
  computeAirborneAcceleration,
  integrateAngularVelocity,
} from '../webgpu/shaders/physics/aerodynamics';
import {
  sampleCenteredUnit,
  sampleCenterWeightedRadius,
} from '../webgpu/shaders/physics/launch';
import {
  PARTICLE_RUNTIME_BYTES,
  PARTICLE_SPAWN_BYTES,
  ParticleRuntimeSchema,
  ParticleSpawnSchema,
} from '../webgpu/shaders/physics/state';
import { computeWindField } from '../webgpu/shaders/physics/turbulence';
import { getSharedTypeGPURoot } from '../webgpu/sharedTypeGPURoot';

const sizes: SizeVariation[] = [
  {
    width: 8,
    height: 12,
    radius: 0,
    flakeStyle: 'glossy',
  },
  {
    width: 14,
    height: 6,
    radius: 2,
    flakeStyle: 'solid',
  },
];

describe('GPU-native particle initialization', () => {
  it('reuses TypeGPU roots and pipeline variants per device', () => {
    const firstDevice = {} as GPUDevice;
    const secondDevice = {} as GPUDevice;
    const firstRoot = getSharedTypeGPURoot(firstDevice);

    expect(getSharedTypeGPURoot(firstDevice)).toBe(firstRoot);
    expect(getSharedTypeGPURoot(secondDevice)).not.toBe(firstRoot);
    expect(createBurstConfettiPipelines(firstRoot, 'bgra8unorm', false)).toBe(
      createBurstConfettiPipelines(firstRoot, 'bgra8unorm', false)
    );
    expect(createConfettiPipelines(firstRoot, 'bgra8unorm', false)).toBe(
      createConfettiPipelines(firstRoot, 'bgra8unorm', false)
    );
    expect(
      createBurstConfettiPipelines(firstRoot, 'bgra8unorm', true)
    ).not.toBe(createBurstConfettiPipelines(firstRoot, 'bgra8unorm', false));
  });

  it('keeps the shared state layout explicit and inside the profiled budget', () => {
    expect(PARTICLE_SPAWN_BYTES).toBe(96);
    expect(PARTICLE_RUNTIME_BYTES).toBe(96);
    expect(PARTICLE_SPAWN_BYTES).toBe(d.sizeOf(ParticleSpawnSchema));
    expect(PARTICLE_RUNTIME_BYTES).toBe(d.sizeOf(ParticleRuntimeSchema));
  });

  it('keeps continuous phases exactly stratified without a JS particle array', () => {
    const count = 20_000;
    const { stride, offset } = createPhasePermutation(count, 37);
    const bins = new Set<number>();

    for (let index = 0; index < count; index++) {
      bins.add((index * stride + offset) % count);
    }

    expect(bins.size).toBe(count);
  });

  it('uses bounded center-weighted Cannon launch distributions', () => {
    expect(sampleCenterWeightedRadius(0)).toBe(0);
    expect(sampleCenterWeightedRadius(0.5)).toBe(0.25);
    expect(sampleCenterWeightedRadius(1)).toBe(1);

    expect(sampleCenteredUnit(0, 0)).toBe(0);
    expect(sampleCenteredUnit(0, 1)).toBe(0.5);
    expect(sampleCenteredUnit(1, 1)).toBe(1);
  });

  it('packs only size-level selection metadata for GPU initialization', () => {
    const inputs = toInitSizeInputs(
      sizes,
      computeSizeFlags(sizes),
      [null, { start: 7, count: 3 }],
      5
    );

    expect(inputs).toHaveLength(sizes.length);
    expect(inputs[0]!.selection).toEqual([0, 5, 1, 0]);
    expect(inputs[1]!.selection).toEqual([7, 3, 2 ** 2, 0]);
  });

  it('deduplicates texture and shape-mask layers by immutable content', () => {
    const sharedTexture = {} as SkImage;
    const uniqueTexture = {} as SkImage;
    const layerSizes: SizeVariation[] = [
      {
        width: 10,
        height: 10,
        radius: 2,
        flakeStyle: 'solid',
        texture: { type: 'image', content: sharedTexture },
      },
      {
        width: 10,
        height: 10,
        radius: 2,
        flakeStyle: 'glossy',
        texture: { type: 'image', content: sharedTexture },
      },
      {
        width: 20,
        height: 12,
        radius: 3,
        flakeStyle: 'solid',
        texture: { type: 'image', content: uniqueTexture },
      },
    ];

    const flags = computeSizeFlags(layerSizes);
    const textureLayer = (index: number) =>
      (flags[index]! >> SIZE_FLAG_TEXTURE_LAYER_SHIFT) & 0xff;
    const maskLayer = (index: number) =>
      (flags[index]! >> SIZE_FLAG_MASK_LAYER_SHIFT) & 0xff;

    expect(textureLayer(0)).toBe(0);
    expect(textureLayer(1)).toBe(0);
    expect(textureLayer(2)).toBe(1);
    expect(maskLayer(0)).toBe(0);
    expect(maskLayer(1)).toBe(0);
    expect(maskLayer(2)).toBe(1);
    expect(canUseTextureOnlyPipeline(layerSizes)).toBe(false);
    expect(
      canUseTextureOnlyPipeline(
        layerSizes.map((size) => ({ ...size, radius: 0 }))
      )
    ).toBe(true);
  });

  it('packs PI origins with prefix ranges instead of expanding particles', () => {
    const configs: PIConfig[] = [
      {
        spread: Math.PI,
        initialSpeed: 1.2,
        count: 12_000,
        speedVariation: { min: 0.8, max: 1.1 },
        colorStart: 0,
        colorCount: 5,
        sizeStart: 0,
        sizeCount: 1,
      },
      {
        spread: Math.PI / 2,
        initialSpeed: 0.9,
        count: 8_000,
        speedVariation: { min: 0.9, max: 1.2 },
        colorStart: 5,
        colorCount: 4,
        sizeStart: 1,
        sizeCount: 1,
      },
    ];

    const origins = toPIBurstOrigins(
      configs,
      [
        { x: 100, y: 500 },
        { x: 300, y: 250 },
      ],
      [0, 250]
    );

    expect(origins).toHaveLength(2);
    expect(origins[0]!.originAndCount).toEqual([100, 500, 0, 12_000]);
    expect(origins[0]!.targetStartAndMode).toEqual([0, 0, 0, 0]);
    expect(origins[1]!.originAndCount).toEqual([300, 250, 250, 8_000]);
    expect(origins[1]!.targetStartAndMode).toEqual([0, 0, 12_000, 0]);
  });

  it('cycles a shorter PI restart position list across configured origins', () => {
    const configs: PIConfig[] = [
      {
        spread: Math.PI,
        initialSpeed: 1,
        count: 10,
        speedVariation: { min: 1, max: 1 },
        colorStart: 0,
        colorCount: 1,
        sizeStart: 0,
        sizeCount: 1,
      },
      {
        spread: Math.PI,
        initialSpeed: 1,
        count: 10,
        speedVariation: { min: 1, max: 1 },
        colorStart: 0,
        colorCount: 1,
        sizeStart: 0,
        sizeCount: 1,
      },
    ];

    const origins = toPIBurstOrigins(configs, [{ x: 120, y: 480 }], [0]);

    expect(origins[0]!.originAndCount.slice(0, 2)).toEqual([120, 480]);
    expect(origins[1]!.originAndCount.slice(0, 2)).toEqual([120, 480]);
  });

  it('packs Cannon targets and prefix ranges without expanding particles', () => {
    const configs: CannonConfig[] = [
      {
        spread: 0.6,
        speed: 1.8,
        count: 10_000,
        speedVariation: { min: 0.8, max: 1.2 },
        colorStart: 0,
        colorCount: 5,
        sizeStart: 0,
        sizeCount: 2,
        target: { x: 200, y: 100 },
      },
      {
        spread: 0.4,
        speed: 1.5,
        count: 10_000,
        speedVariation: { min: 0.9, max: 1.1 },
        colorStart: 0,
        colorCount: 5,
        sizeStart: 0,
        sizeCount: 2,
        target: { x: 250, y: 150 },
      },
    ];

    const origins = toCannonBurstOrigins(configs, [
      { x: -30, y: 880 },
      { x: 420, y: 880 },
    ]);

    expect(origins).toHaveLength(2);
    expect(origins[0]!.targetStartAndMode).toEqual([200, 100, 0, 1]);
    expect(origins[1]!.targetStartAndMode).toEqual([250, 150, 10_000, 1]);
  });

  it('resolves both initialization kernels to WGSL', () => {
    const fallingWGSL = tgpu.resolve([confettiInit]);
    const burstWGSL = tgpu.resolve([burstConfettiInit]);
    const burstTransformWGSL = tgpu.resolve([burstConfettiTransform]);
    const fallingVertexWGSL = tgpu.resolve([confettiVertex]);
    const textureFragmentWGSL = tgpu.resolve([confettiTextureFragment]);
    const burstTextureFragmentWGSL = tgpu.resolve([burstTextureFragment]);
    const sharedPhysicsWGSL = tgpu.resolve([
      computeAirborneAcceleration,
      integrateAngularVelocity,
      computeWindField,
    ]);

    expect(fallingWGSL).toContain('@compute @workgroup_size(64)');
    expect(fallingWGSL).toContain('fn confettiInit');
    expect(fallingWGSL).toContain('let phaseBin');
    expect(burstWGSL).toContain('@compute @workgroup_size(64)');
    expect(burstWGSL).toContain('fn burstConfettiInit');
    expect(burstWGSL).toContain('fn sampleSoftConeDirection');
    expect(burstWGSL).toContain('fn sampleCenterWeightedRadius');
    expect(burstWGSL).toContain('fn sampleCenteredUnit');
    expect(burstTransformWGSL).toContain('fn burstConfettiTransform');
    expect(burstTransformWGSL).toContain('fn computeAirborneAcceleration');
    expect(burstTransformWGSL).toContain('fn integrateQuaternion');
    expect(fallingVertexWGSL).toContain('@vertex');
    expect(fallingVertexWGSL).toContain('fn isParticleInFrontOfNearPlane');
    expect(fallingVertexWGSL).toContain('fn getParticleNearPlaneDistance');
    expect(textureFragmentWGSL).toContain('textureSampleLevel');
    expect(textureFragmentWGSL).not.toContain('fbm');
    expect(burstTextureFragmentWGSL).toContain('textureSampleLevel');
    expect(sharedPhysicsWGSL).toContain('fn computeAirborneAcceleration');
    expect(sharedPhysicsWGSL).toContain('fn integrateAngularVelocity');
    expect(sharedPhysicsWGSL).toContain('fn computeWindField');
  });
});
