import { Canvas, Atlas, ImageShader, Vertices } from 'react-native-skia';
import type { SkImage, SkPoint, SkRect, SkRSXform } from 'react-native-skia';
import type { SharedValue } from 'react-native-reanimated';
import { Platform, StyleSheet, View } from 'react-native';
import type { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';
import type { ConfettiRenderer } from './types';
import { GraphiteConfettiCanvas } from './GraphiteConfettiCanvas';

type ConfettiMesh = {
  vertices: SharedValue<SkPoint[]>;
  textureCoordinates: SharedValue<SkPoint[]>;
  indices: number[];
};

export type ConfettiCanvasProps = {
  renderer?: ConfettiRenderer;
  containerStyle?: StyleProp<ViewStyle>;
  ready: boolean;
  texture: SharedValue<SkImage | null>;
  sprites: SharedValue<SkRect[]>;
  transforms: SharedValue<SkRSXform[]>;
  opacity: SharedValue<number>;
  mesh?: ConfettiMesh;
  onContainerLayout?: (e: LayoutChangeEvent) => void;
};

export function ConfettiCanvas({
  renderer = 'canvas',
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
      {renderer === 'graphite' && Platform.OS !== 'web' ? (
        <GraphiteConfettiCanvas
          ready={ready}
          texture={texture}
          sprites={sprites}
          transforms={transforms}
          opacity={opacity}
          mesh={mesh}
        />
      ) : (
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
      )}
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
