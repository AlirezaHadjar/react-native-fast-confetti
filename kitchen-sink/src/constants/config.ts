export type TextureType = 'default' | 'money' | 'snowflake';

export const TEXTURE_SIZES = {
  money: 50,
  snowflake: 10,
} as const satisfies Record<Exclude<TextureType, 'default'>, number>;

export type DropdownOption<T = any> = {
  label: string;
  value: T;
};

export const textureOptions: DropdownOption<TextureType>[] = [
  { label: 'Default', value: 'default' },
  { label: 'Money', value: 'money' },
  { label: 'Snow', value: 'snowflake' },
];

export const verticalSpacingOptions: DropdownOption<number>[] = [
  { label: 'V. Dense', value: 5 },
  { label: 'Dense', value: 20 },
  { label: 'Normal', value: 50 },
  { label: 'Loose', value: 100 },
  { label: 'V. Loose', value: 200 },
];

export type ScreenConfig = {
  textureType: TextureType;
  verticalSpacing: number;
};

export const DEFAULT_CONFIGS: Record<string, ScreenConfig> = {
  single: {
    textureType: 'default',
    verticalSpacing: 20,
  },
  continuous: {
    textureType: 'default',
    verticalSpacing: 200,
  },
  pi: { textureType: 'default', verticalSpacing: 20 },
  cannon: {
    textureType: 'default',
    verticalSpacing: 20,
  },
};
