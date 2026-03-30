import React from 'react';
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

function renderAtlasCell(
  color: string,
  colorIndex: number,
  size: SizeVariation,
  sizeIndex: number,
  cellX: number,
  cellY: number,
  sizeColorOverrides: (number | null)[]
): React.ReactNode {
  const key = `${colorIndex}-${sizeIndex}`;

  // If this size has a texture AND this is its dedicated color row, render texture
  if (size.texture && sizeColorOverrides[sizeIndex] === colorIndex) {
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
}

function lightenColor(color: string, amount: number): Float32Array {
  const c = Array.from(Skia.Color(color));
  const r = c[0] ?? 0;
  const g = c[1] ?? 0;
  const b = c[2] ?? 0;
  const a = c[3] ?? 1;
  return new Float32Array([
    r + (1 - r) * amount,
    g + (1 - g) * amount,
    b + (1 - b) * amount,
    a,
  ]);
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
          return renderAtlasCell(
            color, colorIndex, size, sizeIndex, cellX, cellY, sizeColorOverrides
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
      const size = sizeVariations[sizeIndex];
      if (!size) return rect(0, 0, 0, 0);
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
