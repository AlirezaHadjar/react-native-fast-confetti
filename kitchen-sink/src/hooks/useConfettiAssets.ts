import { useImage, useSVG } from '@shopify/react-native-skia';
import type { TextureType } from '../constants/config';

export function useConfettiAssets(textureType: TextureType) {
  const snowFlakeSVG = useSVG(
    textureType === 'snowflake'
      ? require('../../assets/snow-flake.svg')
      : null
  );
  const moneyStackImage = useImage(
    textureType === 'money' ? require('../../assets/money-stack-2.png') : null
  );
  const isLoading =
    (textureType === 'snowflake' && !snowFlakeSVG) ||
    (textureType === 'money' && !moneyStackImage);

  return { snowFlakeSVG, moneyStackImage, isLoading };
}
