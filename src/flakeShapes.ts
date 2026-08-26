import { Skia } from '@shopify/react-native-skia';
import type { FlakeShape } from './types';

export function makeFilledShapePath(
  shape: Exclude<FlakeShape, 'rectangle' | 'streamer'>,
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
    const points = Array.from({ length: 10 }, (_, index) => {
      const angle = -Math.PI / 2 + (index * Math.PI) / 5;
      const radius = index % 2 === 0 ? 0.46 : 0.23;
      return {
        x: px(0.5 + Math.cos(angle) * radius),
        y: py(0.5 + Math.sin(angle) * radius),
      };
    });

    for (let index = 0; index < points.length; index++) {
      const point = points[index]!;
      const previous = points[(index + points.length - 1) % points.length]!;
      const next = points[(index + 1) % points.length]!;
      const cornerInset = index % 2 === 0 ? 0.45 : 0;
      const entryX = point.x + (previous.x - point.x) * cornerInset;
      const entryY = point.y + (previous.y - point.y) * cornerInset;
      const exitX = point.x + (next.x - point.x) * cornerInset;
      const exitY = point.y + (next.y - point.y) * cornerInset;

      if (index === 0) path.moveTo(entryX, entryY);
      else path.lineTo(entryX, entryY);
      path.quadTo(point.x, point.y, exitX, exitY);
    }
    path.close();
    return path.build();
  }

  const diameter = Math.min(width, height);
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const petalRadius = diameter * 0.16;
  const orbitRadius = diameter * 0.3;
  path.addCircle(centerX, centerY, diameter * 0.31);
  for (let index = 0; index < 6; index++) {
    const angle = -Math.PI / 2 + (index * Math.PI) / 3;
    path.addCircle(
      centerX + Math.cos(angle) * orbitRadius,
      centerY + Math.sin(angle) * orbitRadius,
      petalRadius
    );
  }
  return path.build();
}

export function makeStreamerPath(
  x: number,
  y: number,
  width: number,
  height: number
) {
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
