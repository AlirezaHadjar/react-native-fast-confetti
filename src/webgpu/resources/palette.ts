import { Skia } from 'react-native-skia';

import type { FixedLengthArray } from '../../typeHelpers';

const hexToRgba = (hex: string): FixedLengthArray<number, 4> => {
  const color = Skia.Color(hex);
  return [color[0] ?? 0, color[1] ?? 0, color[2] ?? 0, color[3] ?? 1];
};

export const toPaletteInputs = (colors: string[]) =>
  (colors.length > 0 ? colors : ['#ffffff']).map(hexToRgba);
