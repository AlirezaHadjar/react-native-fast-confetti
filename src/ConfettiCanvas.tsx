import type { ComponentProps } from 'react';
import {
  Canvas,
  Atlas,
  ImageShader,
  Vertices,
} from '@shopify/react-native-skia';
import { StyleSheet, View } from 'react-native';
import type { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';

type AtlasComponentProps = ComponentProps<typeof Atlas>;
type VerticesComponentProps = ComponentProps<typeof Vertices>;

type ConfettiMesh = {
  vertices: VerticesComponentProps['vertices'];
  textureCoordinates: VerticesComponentProps['textures'];
  indices: number[];
};

type ConfettiCanvasProps = {
  containerStyle?: StyleProp<ViewStyle>;
  ready: boolean;
  texture: AtlasComponentProps['image'];
  sprites: AtlasComponentProps['sprites'];
  transforms: AtlasComponentProps['transforms'];
  opacity: AtlasComponentProps['opacity'];
  mesh?: ConfettiMesh;
  onContainerLayout?: (e: LayoutChangeEvent) => void;
};

export function ConfettiCanvas({
  containerStyle,
  ready,
  texture,
  sprites,
  transforms,
  opacity,
  mesh,
  onContainerLayout,
}: ConfettiCanvasProps) {
  return (
    <View
      pointerEvents="none"
      style={[styles.container, containerStyle]}
      onLayout={onContainerLayout}
    >
      <Canvas style={styles.canvasContainer}>
        {ready && mesh ? (
          <Vertices
            vertices={mesh.vertices}
            textures={mesh.textureCoordinates}
            indices={mesh.indices}
            mode="triangles"
            opacity={opacity}
          >
            <ImageShader image={texture} />
          </Vertices>
        ) : ready ? (
          <Atlas
            image={texture}
            sprites={sprites}
            transforms={transforms}
            opacity={opacity}
          />
        ) : null}
      </Canvas>
    </View>
  );
}

export const confettiStyles = StyleSheet.create({
  container: {
    height: '100%',
    width: '100%',
    position: 'absolute',
    zIndex: 1,
  },
  canvasContainer: {
    width: '100%',
    height: '100%',
  },
});

const styles = confettiStyles;
