export type TextureType = 'default' | 'money' | 'snowflake';
export type RadiusType = 'square' | 'circle';

export type DropdownOption<T = any> = {
  label: string;
  value: T;
};

export const textureOptions: DropdownOption<TextureType>[] = [
  { label: 'Default', value: 'default' },
  { label: 'Money', value: 'money' },
  { label: 'Snow', value: 'snowflake' },
];

export const radiusOptions: DropdownOption<RadiusType>[] = [
  { label: 'No Radius (0)', value: 'square' },
  { label: 'Circle', value: 'circle' },
];

export const verticalSpacingOptions: DropdownOption<number>[] = [
  { label: 'V. Dense', value: 5 },
  { label: 'Dense', value: 20 },
  { label: 'Normal', value: 50 },
  { label: 'V. Loose', value: 100 },
];

export type ScreenConfig = {
  textureType: TextureType;
  radiusRange: RadiusType;
  verticalSpacing: number;
};

export const DEFAULT_CONFIGS: Record<string, ScreenConfig> = {
  single: {
    textureType: 'default',
    radiusRange: 'square',
    verticalSpacing: 20,
  },
  continuous: {
    textureType: 'default',
    radiusRange: 'square',
    verticalSpacing: 200,
  },
  pi: { textureType: 'default', radiusRange: 'square', verticalSpacing: 20 },
  cannon: {
    textureType: 'default',
    radiusRange: 'square',
    verticalSpacing: 20,
  },
};
