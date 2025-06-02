import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { type ConfettiProps } from '../types';
import {
  useTexture,
  Group,
  RoundedRect,
  rect,
  type SkSVG,
  ImageSVG,
  type SkImage,
  Image,
} from '@shopify/react-native-skia';

type Strict<T> = T extends undefined ? never : T;

type MinimalBox = {
  colorIndex: number;
  sizeIndex: number;
};

export const useConfettiLogic = <T extends MinimalBox>({
  sizeVariations,
  colors,
  boxes,
  textureProps,
}: {
  colors: Strict<ConfettiProps['colors']>;
  boxes: SharedValue<T[]>;
  sizeVariations: {
    width: number;
    height: number;
    radius: number;
  }[];
  textureProps?:
    | {
        type: 'image';
        content: SkImage;
      }
    | {
        type: 'svg';
        content: SkSVG;
      };
}) => {
  const maxWidth = Math.max(...sizeVariations.map((size) => size.width));
  const maxHeight = Math.max(...sizeVariations.map((size) => size.height));

  const texture = useTexture(
    <Group>
      {colors.map((color, colorIndex) => {
        return sizeVariations.map((size, sizeIndex) => {
          if (textureProps?.type === 'svg') {
            return (
              <ImageSVG
                key={`${colorIndex}-${sizeIndex}`}
                x={sizeIndex * maxWidth}
                y={colorIndex * maxHeight}
                width={size.width}
                height={size.height}
                svg={textureProps.content}
              />
            );
          }
          if (textureProps?.type === 'image') {
            return (
              <Image
                key={`${colorIndex}-${sizeIndex}`}
                x={sizeIndex * maxWidth}
                y={colorIndex * maxHeight}
                width={size.width}
                height={size.height}
                image={textureProps.content}
              />
            );
          }
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

  const sprites = useDerivedValue(() => {
    return boxes.get().map((box) => {
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
  });

  return {
    texture,
    sprites,
  };
};
