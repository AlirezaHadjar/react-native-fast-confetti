import { useImage, useSVG } from '@shopify/react-native-skia';

export function useConfettiAssets() {
  const snowFlakeSVG = useSVG(require('../../assets/snow-flake.svg'));
  const moneyStackImage = useImage(require('../../assets/money-stack-2.png'));
  const isLoading = !snowFlakeSVG || !moneyStackImage;

  return { snowFlakeSVG, moneyStackImage, isLoading };
}
