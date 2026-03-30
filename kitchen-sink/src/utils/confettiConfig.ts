import type { SkImage, SkSVG } from '@shopify/react-native-skia';
import type { TextureType } from '../constants/config';

export function getTextureProps(
  textureType: TextureType,
  moneyStackImage: SkImage,
  snowFlakeSVG: SkSVG
): { image: SkImage } | { svg: SkSVG } | Record<string, never> {
  switch (textureType) {
    case 'money':
      return { image: moneyStackImage };
    case 'snowflake':
      return { svg: snowFlakeSVG };
    default:
      return {};
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
