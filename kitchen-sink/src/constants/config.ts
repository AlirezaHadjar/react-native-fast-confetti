export type TextureType = 'default' | 'money' | 'snowflake';
export type EngineType = 'skia' | 'webgpu';

export type DropdownOption<T = any> = {
  label: string;
  value: T;
};

export const textureOptions: DropdownOption<TextureType>[] = [
  { label: 'Default', value: 'default' },
  { label: 'Money', value: 'money' },
  { label: 'Snow', value: 'snowflake' },
];

export const engineOptions: DropdownOption<EngineType>[] = [
  { label: 'Skia', value: 'skia' },
  { label: 'WebGPU', value: 'webgpu' },
];

export const verticalSpacingOptions: DropdownOption<number>[] = [
  { label: 'V. Dense', value: 5 },
  { label: 'Dense', value: 20 },
  { label: 'Normal', value: 50 },
  { label: 'Loose', value: 100 },
  { label: 'V. Loose', value: 200 },
];

export type ScreenConfig = {
  engineType: EngineType;
  textureType: TextureType;
  verticalSpacing: number;
};

export const DEFAULT_CONFIGS: Record<string, ScreenConfig> = {
  single: {
    engineType: 'skia',
    textureType: 'default',
    verticalSpacing: 20,
  },
  continuous: {
    engineType: 'skia',
    textureType: 'default',
    verticalSpacing: 200,
  },
  pi: { engineType: 'skia', textureType: 'default', verticalSpacing: 20 },
  cannon: {
    engineType: 'skia',
    textureType: 'default',
    verticalSpacing: 20,
  },
};
