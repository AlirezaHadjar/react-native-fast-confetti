export type TextureType = 'default' | 'money' | 'snowflake';
export type RadiusType = 'square' | 'circle';

export type DropdownOption<T = any> = {
  label: string;
  value: T;
};

export const textureOptions: DropdownOption<TextureType>[] = [
  { label: 'Default Confetti', value: 'default' },
  { label: 'Money Stack', value: 'money' },
  { label: 'Snowflake', value: 'snowflake' },
];

export const radiusOptions: DropdownOption<RadiusType>[] = [
  { label: 'No Radius (0)', value: 'square' },
  { label: 'Circle', value: 'circle' },
];

export const verticalSpacingOptions: DropdownOption<number>[] = [
  { label: 'Dense (5)', value: 5 },
  { label: 'Normal (20)', value: 20 },
  { label: 'Loose (50)', value: 50 },
  { label: 'Very Loose (100)', value: 100 },
];

export type ScreenConfig = {
  textureType: TextureType;
  radiusRange: RadiusType;
  verticalSpacing: number;
};

export const DEFAULT_CONFIGS: Record<string, ScreenConfig> = {
  single: { textureType: 'default', radiusRange: 'square', verticalSpacing: 20 },
  continuous: { textureType: 'default', radiusRange: 'square', verticalSpacing: 200 },
  pi: { textureType: 'default', radiusRange: 'square', verticalSpacing: 20 },
  cannon: { textureType: 'default', radiusRange: 'square', verticalSpacing: 20 },
};
