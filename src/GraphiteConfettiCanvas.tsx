import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import {
  BlendMode,
  FilterMode,
  MipmapMode,
  Skia,
  SkiaGraphiteView,
  TileMode,
  VertexMode,
} from 'react-native-skia';
import type { SkGraphiteContext, SkiaGraphiteViewRef } from 'react-native-skia';
import {
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated';
import { runOnUISync } from 'react-native-worklets';
import type { ConfettiCanvasProps } from './ConfettiCanvas';

const transparent = new Float32Array([0, 0, 0, 0]);
const style = { width: '100%', height: '100%' } as const;

export function GraphiteConfettiCanvas({
  ready,
  texture,
  sprites,
  transforms,
  opacity,
  mesh,
}: Omit<ConfettiCanvasProps, 'containerStyle' | 'onContainerLayout'>) {
  const ref = useRef<SkiaGraphiteViewRef>(null);
  const context = useSharedValue<SkGraphiteContext | null>(null);
  const paint = useMemo(() => {
    const result = Skia.Paint();
    result.setAntiAlias(true);
    return result;
  }, []);
  const shader = useDerivedValue(() => {
    const image = texture.get();
    return mesh && image
      ? image.makeShaderOptions(
          TileMode.Clamp,
          TileMode.Clamp,
          FilterMode.Linear,
          MipmapMode.None
        )
      : null;
  });

  const onLayout = useCallback(() => {
    context.set(ref.current?.getContext() ?? null);
  }, [context]);

  useLayoutEffect(
    () => () => {
      runOnUISync(() => {
        context.set(null);
      });
    },
    [context]
  );

  // React to the same animated inputs as Canvas. Paused and static scenes
  // do not keep producing recordings or hold a separate frame callback.
  useAnimatedReaction(
    () => ({
      context: context.get(),
      image: texture.get(),
      sprites: sprites.get(),
      transforms: transforms.get(),
      opacity: opacity.get(),
      vertices: mesh ? mesh.vertices.get() : null,
      textures: mesh?.textureCoordinates.get(),
      shader: shader.get(),
    }),
    (frame) => {
      const ctx = frame.context;
      if (!ctx) return;
      const canvas = ctx.beginRecording();
      canvas.clear(transparent);
      if (ready && frame.image) {
        paint.setAlphaf(frame.opacity);
        paint.setShader(frame.shader);
        if (mesh && frame.vertices) {
          const vertices = Skia.MakeVertices(
            VertexMode.Triangles,
            frame.vertices,
            frame.textures,
            undefined,
            mesh.indices
          );
          canvas.drawVertices(vertices, BlendMode.SrcOver, paint);
          vertices.dispose();
        } else {
          canvas.drawAtlas(
            frame.image,
            frame.sprites,
            frame.transforms,
            paint,
            BlendMode.DstOver,
            undefined,
            { filter: FilterMode.Linear }
          );
        }
      }
      const recording = ctx.finishRecording();
      ctx.submit(recording);
      recording.dispose();
    }
  );

  return <SkiaGraphiteView ref={ref} style={style} onLayout={onLayout} />;
}
