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
  Path,
} from '@shopify/react-native-skia';
import type { SizeVariation, ColorRange } from './useConfettiFlakes';

function makeFilledShapePath(
  shape: Exclude<SizeVariation['shape'], 'rectangle' | 'streamer'>,
  x: number,
  y: number,
  width: number,
  height: number
) {
  const path = Skia.PathBuilder.Make();
  const px = (value: number) => x + value * width;
  const py = (value: number) => y + value * height;

  if (shape === 'heart') {
    path.moveTo(px(0.5), py(0.92));
    path.cubicTo(px(0.42), py(0.82), px(0.08), py(0.61), px(0.08), py(0.35));
    path.cubicTo(px(0.08), py(0.12), px(0.35), py(0.05), px(0.5), py(0.26));
    path.cubicTo(px(0.65), py(0.05), px(0.92), py(0.12), px(0.92), py(0.35));
    path.cubicTo(px(0.92), py(0.61), px(0.58), py(0.82), px(0.5), py(0.92));
    path.close();
    return path.build();
  }

  if (shape === 'star') {
    const points = Array.from({ length: 10 }, (_, i) => {
      const angle = -Math.PI / 2 + (i * Math.PI) / 5;
      // The reference is a compact die-cut star: broad arms and shallow notches.
      const radius = i % 2 === 0 ? 0.46 : 0.23;
      return {
        x: px(0.5 + Math.cos(angle) * radius),
        y: py(0.5 + Math.sin(angle) * radius),
      };
    });

    for (let i = 0; i < 10; i++) {
      const previous = points[(i + points.length - 1) % points.length]!;
      const point = points[i]!;
      const next = points[(i + 1) % points.length]!;
      const cornerInset = i % 2 === 0 ? 0.45 : 0;
      const entryX = point.x + (previous.x - point.x) * cornerInset;
      const entryY = point.y + (previous.y - point.y) * cornerInset;
      const exitX = point.x + (next.x - point.x) * cornerInset;
      const exitY = point.y + (next.y - point.y) * cornerInset;

      if (i === 0) path.moveTo(entryX, entryY);
      else path.lineTo(entryX, entryY);
      path.quadTo(point.x, point.y, exitX, exitY);
    }
    path.close();
    return path.build();
  }

  // The reference flower is a six-petal punch, not a rounded polygon.
  const diameter = Math.min(width, height);
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const petalRadius = diameter * 0.16;
  const orbitRadius = diameter * 0.3;
  path.addCircle(centerX, centerY, diameter * 0.31);
  for (let i = 0; i < 6; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 3;
    path.addCircle(
      centerX + Math.cos(angle) * orbitRadius,
      centerY + Math.sin(angle) * orbitRadius,
      petalRadius
    );
  }
  return path.build();
}

function makeStreamerPath(x: number, y: number, width: number, height: number) {
  const path = Skia.PathBuilder.Make();
  const points = [
    { x: 0.1, y: 0.36 },
    { x: 0.3, y: 0.64 },
    { x: 0.5, y: 0.36 },
    { x: 0.7, y: 0.64 },
    { x: 0.9, y: 0.36 },
  ];
  const handles = [0.099, 0.18, 0.18, 0.18, 0.099];

  path.moveTo(x + points[0]!.x * width, y + points[0]!.y * height);
  for (let index = 0; index < points.length - 1; index++) {
    const point = points[index]!;
    const next = points[index + 1]!;
    path.cubicTo(
      x + (point.x + handles[index]!) * width,
      y + point.y * height,
      x + (next.x - handles[index + 1]!) * width,
      y + next.y * height,
      x + next.x * width,
      y + next.y * height
    );
  }
  return path.build();
}

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
