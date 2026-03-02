import type { SkImage, SkSVG } from '@shopify/react-native-skia';
import type { LegacyConfettiProps } from 'react-native-fast-confetti';
import type { TextureType, RadiusType } from '../constants/config';

export function getTextureProps(
  textureType: TextureType,
  moneyStackImage: SkImage,
  snowFlakeSVG: SkSVG,
  radiusRange: RadiusType
): LegacyConfettiProps {
  switch (textureType) {
    case 'money':
      return { type: 'image' as const, flakeImage: moneyStackImage };
    case 'snowflake':
      return { type: 'svg' as const, flakeSvg: snowFlakeSVG };
    default: {
      const range: [number, number] =
        radiusRange === 'square' ? [0, 0] : [0, 15];
      return { type: 'default' as const, radiusRange: range };
    }
  }
}

export function getFlakeSize(textureType: TextureType) {
  switch (textureType) {
    case 'money':
      return [{ width: 50, height: 50 }];
    case 'snowflake':
      return [{ width: 10, height: 10 }];
    default:
      return [{ width: 15, height: 8 }];
  }
}

export function getRotation(
  textureType: TextureType,
  mode: 'single' | 'continuous' | 'pi' | 'cannon'
) {
  if (mode === 'pi') {
    switch (textureType) {
      case 'money':
        return {
          x: { min: 1 * Math.PI, max: 1.5 * Math.PI },
          z: { min: 1 * Math.PI, max: 3 * Math.PI },
        };
      case 'snowflake':
        return {
          x: { min: 0.5 * Math.PI, max: 2 * Math.PI },
          z: { min: 1 * Math.PI, max: 3 * Math.PI },
        };
      default:
        return {
          x: { min: 0.5 * Math.PI, max: 2 * Math.PI },
          z: { min: 1 * Math.PI, max: 5 * Math.PI },
        };
    }
  }
  switch (textureType) {
    case 'money':
      return {
        x: { min: 1 * Math.PI, max: 2 * Math.PI },
        z: { min: 1 * Math.PI, max: 2 * Math.PI },
      };
    case 'snowflake':
      return {
        x: { min: 0.5 * Math.PI, max: 20 * Math.PI },
        z: { min: 1 * Math.PI, max: 20 * Math.PI },
      };
    default:
      return {
        x: { min: 2 * Math.PI, max: 20 * Math.PI },
        z: { min: 2 * Math.PI, max: 20 * Math.PI },
      };
  }
}
