import React from 'react';
import type { SharedValue } from 'react-native-reanimated';
import {
  Skia,
  useTexture,
  useRectBuffer,
  Group,
  RoundedRect,
  vec,
  LinearGradient,
  ImageSVG,
  Image,
  Path,
} from 'react-native-skia';
import type { SizeVariation, ColorRange } from './useConfettiFlakes';
import {
  BURST_COLOR_INDEX,
  BURST_META_STRIDE,
  BURST_SIZE_INDEX,
  type PackedBurstBoxes,
} from '../packedBurstBoxes';
import { makeFilledShapePath, makeStreamerPath } from '../flakeShapes';

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
  if (
    size.texture &&
    range &&
    range.count === 1 &&
    range.start === colorIndex
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

  const gradient =
    size.flakeStyle === 'glossy' ? (
      <LinearGradient
        start={vec(cellX, cellY)}
        end={vec(cellX, cellY + size.height)}
        colors={[lightenColor(color, 0.35), color]}
        positions={[0, 0.6]}
      />
    ) : null;

  if (size.shape === 'streamer') {
    return (
      <Path
        key={key}
        path={makeStreamerPath(cellX, cellY, size.width, size.height)}
        style="stroke"
        strokeWidth={Math.min(size.width, size.height) * 0.2}
        strokeCap="round"
        strokeJoin="round"
        color={color}
      >
        {gradient}
      </Path>
    );
  }

  if (size.shape !== 'rectangle') {
    return (
      <Path
        key={key}
        path={makeFilledShapePath(
          size.shape,
          cellX,
          cellY,
          size.width,
          size.height
        )}
        color={color}
      >
        {gradient}
      </Path>
    );
  }

  if (size.flakeStyle === 'glossy') {
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
          colors={[lightenColor(color, 0.35), color]}
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

const useConfettiAtlas = (
  sizeVariations: SizeVariation[],
  colors: string[],
  sizeColorOverrides: (ColorRange | null)[]
) => {
  const maxWidth = Math.max(...sizeVariations.map((size) => size.width));
  const maxHeight = Math.max(...sizeVariations.map((size) => size.height));
  const texture = useTexture(
    <Group>
      {colors.map((color, colorIndex) => {
        return sizeVariations.map((size, sizeIndex) => {
          const cellX = sizeIndex * maxWidth;
          const cellY = colorIndex * maxHeight;
          return renderAtlasCell(
            color,
            colorIndex,
            size,
            sizeIndex,
            cellX,
            cellY,
            sizeColorOverrides
          );
        });
      })}
    </Group>,
    {
      width: maxWidth * sizeVariations.length,
      height: maxHeight * colors.length,
    }
  );
  return { maxWidth, maxHeight, texture };
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
  count: number;
}) => {
  const { maxWidth, maxHeight, texture } = useConfettiAtlas(
    sizeVariations,
    colors,
    sizeColorOverrides
  );

  const sprites = useRectBuffer(count, (value, index) => {
    'worklet';
    const current = boxes.get();
    const box = current[index];
    if (!box) {
      value.setXYWH(0, 0, 0, 0);
      return;
    }
    const size = sizeVariations[box.sizeIndex];
    if (!size) {
      value.setXYWH(0, 0, 0, 0);
      return;
    }
    value.setXYWH(
      box.sizeIndex * maxWidth,
      box.colorIndex * maxHeight,
      size.width,
      size.height
    );
  });

  return {
    texture,
    sprites,
  };
};

export const usePackedConfettiLogic = ({
  sizeVariations,
  colors,
  boxes,
  sizeColorOverrides,
  count,
}: {
  colors: string[];
  boxes: SharedValue<PackedBurstBoxes | null>;
  sizeVariations: SizeVariation[];
  sizeColorOverrides: (ColorRange | null)[];
  count: number;
}) => {
  const { maxWidth, maxHeight, texture } = useConfettiAtlas(
    sizeVariations,
    colors,
    sizeColorOverrides
  );

  const sprites = useRectBuffer(count, (value, index) => {
    'worklet';
    const current = boxes.get();
    if (!current) {
      value.setXYWH(0, 0, 0, 0);
      return;
    }
    const metaOffset = index * BURST_META_STRIDE;
    const colorIndex = current.metadata[metaOffset + BURST_COLOR_INDEX] ?? 0;
    const sizeIndex = current.metadata[metaOffset + BURST_SIZE_INDEX] ?? -1;
    const size = sizeVariations[sizeIndex];
    if (!size) {
      value.setXYWH(0, 0, 0, 0);
      return;
    }
    value.setXYWH(
      sizeIndex * maxWidth,
      colorIndex * maxHeight,
      size.width,
      size.height
    );
  });

  return { texture, sprites };
};
