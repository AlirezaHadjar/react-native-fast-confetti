import { Platform } from 'react-native';

export type TextureType = 'default' | 'money' | 'snowflake';
export type RendererType = 'webgpu' | 'skia';

// Flip this single flag to run every kitchen-sink example at 20,000 particles
// per component/origin. Keep it disabled for the normal demo configuration.
export const PARTICLE_PRESSURE_MODE = false;

const PRESSURE_PARTICLE_COUNT = 20_000;
const particleCount = (normalCount: number) =>
  PARTICLE_PRESSURE_MODE ? PRESSURE_PARTICLE_COUNT : normalCount;

export const PARTICLE_COUNTS = {
  single: particleCount(Platform.OS === 'web' ? 2_000 : 400),
  continuous: particleCount(200),
  piOrigin: particleCount(500),
  cannonOrigin: particleCount(150),
  menu: {
    single: particleCount(100),
    continuous: particleCount(400),
    piOrigin: particleCount(100),
    cannonOrigin: particleCount(50),
  },
} as const;

export type DropdownOption<T = any> = {
  label: string;
  value: T;
};

export const textureOptions: DropdownOption<TextureType>[] = [
  { label: 'Default', value: 'default' },
  { label: 'Money', value: 'money' },
  { label: 'Snow', value: 'snowflake' },
];

export const rendererOptions: DropdownOption<RendererType>[] = [
  { label: 'WebGPU', value: 'webgpu' },
  { label: 'Skia', value: 'skia' },
];

export const verticalSpacingOptions: DropdownOption<number>[] = [
  { label: 'V. Dense', value: 5 },
  { label: 'Dense', value: 20 },
  { label: 'Normal', value: 50 },
  { label: 'Loose', value: 100 },
  { label: 'V. Loose', value: 200 },
];

export type ScreenConfig = {
  renderer: RendererType;
  textureType: TextureType;
  verticalSpacing: number;
};

export const DEFAULT_CONFIGS: Record<string, ScreenConfig> = {
  single: {
    renderer: 'webgpu',
    textureType: 'default',
    verticalSpacing: 20,
  },
  continuous: {
    renderer: 'webgpu',
    textureType: 'default',
    verticalSpacing: 200,
  },
  pi: { renderer: 'webgpu', textureType: 'default', verticalSpacing: 20 },
  cannon: {
    renderer: 'webgpu',
    textureType: 'default',
    verticalSpacing: 20,
  },
};
