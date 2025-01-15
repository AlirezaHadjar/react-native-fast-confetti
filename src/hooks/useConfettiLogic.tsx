import type { ConfettiProps } from '../types';
import {
  useTexture,
  Group,
  RoundedRect,
  rect,
} from '@shopify/react-native-skia';

type Strict<T> = T extends undefined ? never : T;

export const useConfettiLogic = ({
  sizeVariations,
  colors,
  boxes,
}: {
  count: Strict<ConfettiProps['count']>;
  colors: Strict<ConfettiProps['colors']>;
  boxes: {
    colorIndex: number;
    sizeIndex: number;
  }[];
  sizeVariations: {
    width: number;
    height: number;
    radius: number;
  }[];
}) => {
  const maxWidth = Math.max(...sizeVariations.map((size) => size.width));
  const maxHeight = Math.max(...sizeVariations.map((size) => size.height));

  const texture = useTexture(
    <Group>
      {colors.map((color, colorIndex) => {
        return sizeVariations.map((size, sizeIndex) => {
          return (
            <RoundedRect
              key={`${colorIndex}-${sizeIndex}`}
              x={sizeIndex * maxWidth}
              y={colorIndex * maxHeight}
              width={size.width}
              height={size.height}
              r={size.radius}
              color={color}
            />
          );
        });
      })}
    </Group>,
    {
      width: maxWidth * sizeVariations.length,
      height: maxHeight * colors.length,
    }
  );

  const sprites = boxes.map((box) => {
    const colorIndex = box.colorIndex;
    const sizeIndex = box.sizeIndex;
    const size = sizeVariations[sizeIndex]!;
    return rect(
      sizeIndex * maxWidth,
      colorIndex * maxHeight,
      size.width,
      size.height
    );
  });

  return {
    texture,
    sprites,
  };
};
