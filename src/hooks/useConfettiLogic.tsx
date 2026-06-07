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
import type { SizeVariation, ColorRange } from './useConfettiFlakes';

function renderAtlasCell(
  color: string,
  colorIndex: number,
  size: SizeVariation,
  sizeIndex: number,
  cellX: number,
  cellY: number,
  sizeColorOverrides: (ColorRange | null)[]
): React.ReactNode {
  const key = `${colorIndex}-${sizeIndex}`;

  // If this size has a texture AND this is its dedicated color row, render texture
  const range = sizeColorOverrides[sizeIndex];
  if (size.texture && range && range.count === 1 && range.start === colorIndex) {
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
  const c = Skia.Color(color);
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
  count,
}: {
  colors: string[];
  boxes: SharedValue<T[]>;
  sizeVariations: SizeVariation[];
  sizeColorOverrides: (ColorRange | null)[];
  count?: number;
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
    const current = boxes.get();
    const n = count ?? current.length;
    const result = new Array(n);
    for (let i = 0; i < n; i++) {
      const box = current[i];
      if (!box) {
        result[i] = rect(0, 0, 0, 0);
        continue;
      }
      const size = sizeVariations[box.sizeIndex];
      if (!size) {
        result[i] = rect(0, 0, 0, 0);
        continue;
      }
      result[i] = rect(
        box.sizeIndex * maxWidth,
        box.colorIndex * maxHeight,
        size.width,
        size.height
      );
    }
    return result;
  });

  return {
    texture,
    sprites,
  };
};
