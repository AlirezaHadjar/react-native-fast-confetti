import { useMemo } from 'react';
import type { SkImage, SkSVG } from '@shopify/react-native-skia';

type TextureRootProps =
  | { image: SkImage; svg?: undefined }
  | { image?: undefined; svg: SkSVG }
  | { image?: undefined; svg?: undefined };

export const useTextureProps = (textureRootProps: TextureRootProps) => {
  const rootImage =
    'image' in textureRootProps ? textureRootProps.image : undefined;
  const rootSvg =
    'svg' in textureRootProps ? textureRootProps.svg : undefined;
  const textureProps = useMemo(() => {
    if (rootImage) {
      return { type: 'image' as const, content: rootImage };
    }
    if (rootSvg) {
      return { type: 'svg' as const, content: rootSvg };
    }
    return undefined;
  }, [rootImage, rootSvg]);

  const hasTexture = textureProps !== undefined;

  return { textureProps, hasTexture };
};
