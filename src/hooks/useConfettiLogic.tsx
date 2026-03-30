import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import {
  Skia,
  useTexture,
  Group,
  RoundedRect,
  rect,
  vec,
  LinearGradient,
  ImageSVG,
  Image,
} from '@shopify/react-native-skia';
import type { SizeVariation } from './useConfettiFlakes';

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
  sizeColorOverrides,
}: {
  colors: string[];
  boxes: SharedValue<T[]>;
  sizeVariations: SizeVariation[];
  sizeColorOverrides: (number | null)[];
}) => {
  const maxWidth = Math.max(...sizeVariations.map((size) => size.width));
  const maxHeight = Math.max(...sizeVariations.map((size) => size.height));

  const texture = useTexture(
    <Group>
      {colors.map((color, colorIndex) => {
        return sizeVariations.map((size, sizeIndex) => {
          const cellX = sizeIndex * maxWidth;
          const cellY = colorIndex * maxHeight;
          const key = `${colorIndex}-${sizeIndex}`;

          // If this size has a texture AND this is its dedicated color row, render texture
          if (
            size.texture &&
            sizeColorOverrides[sizeIndex] === colorIndex
          ) {
            if (size.texture.type === 'svg') {
              return (
                <ImageSVG
                  key={key}
                  x={cellX}
                  y={cellY}
                  width={size.width}
                  height={size.height}
                  svg={size.texture.content}
                />
              );
            }
            return (
              <Image
                key={key}
                x={cellX}
                y={cellY}
                width={size.width}
                height={size.height}
                image={size.texture.content}
              />
            );
          }

          // Non-textured cell: render colored rect (or skip if this is a texture row for another size)
          if (size.texture) {
            // This size is textured but this isn't its color row — render nothing visible
            return null;
          }

          if (size.flakeStyle === 'glossy') {
            const lighter = lightenColor(color, 0.35);
            return (
              <RoundedRect
                key={key}
                x={cellX}
                y={cellY}
                width={size.width}
                height={size.height}
                r={size.radius}
              >
                <LinearGradient
                  start={vec(cellX, cellY)}
                  end={vec(cellX, cellY + size.height)}
                  colors={[lighter, color]}
                  positions={[0, 0.6]}
                />
              </RoundedRect>
            );
          }
          return (
            <RoundedRect
              key={key}
              x={cellX}
              y={cellY}
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
