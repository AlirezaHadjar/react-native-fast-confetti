import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { type ConfettiProps, type FlakeStyle } from '../types';
import {
  Skia,
  useTexture,
  Group,
  RoundedRect,
  rect,
  vec,
  LinearGradient,
  type SkSVG,
  ImageSVG,
  type SkImage,
  Image,
} from '@shopify/react-native-skia';

type Strict<T> = T extends undefined ? never : T;

function lightenColor(color: string, amount: number): Float32Array {
  const c = Skia.Color(color);
  const result = new Float32Array(4);
  result[0] = c[0]! + (1 - c[0]!) * amount;
  result[1] = c[1]! + (1 - c[1]!) * amount;
  result[2] = c[2]! + (1 - c[2]!) * amount;
  result[3] = c[3]!;
  return result;
}

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
    flakeStyle?: FlakeStyle;
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
          const flakeX = sizeIndex * maxWidth;
          const flakeY = colorIndex * maxHeight;
          if (size.flakeStyle === 'glossy') {
            const lighter = lightenColor(color, 0.35);
            return (
              <RoundedRect
                key={`${colorIndex}-${sizeIndex}`}
                x={flakeX}
                y={flakeY}
                width={size.width}
                height={size.height}
                r={size.radius}
              >
                <LinearGradient
                  start={vec(flakeX, flakeY)}
                  end={vec(flakeX, flakeY + size.height)}
                  colors={[lighter, color]}
                  positions={[0, 0.6]}
                />
              </RoundedRect>
            );
          }
          return (
            <RoundedRect
              key={`${colorIndex}-${sizeIndex}`}
              x={flakeX}
              y={flakeY}
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
