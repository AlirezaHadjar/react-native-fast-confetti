export type TextureType = 'default' | 'money' | 'snowflake';
export type RendererType = 'webgpu' | 'skia';

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
