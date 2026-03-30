import type { ComponentProps } from 'react';
import { Canvas, Atlas } from '@shopify/react-native-skia';
import { StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

type AtlasComponentProps = ComponentProps<typeof Atlas>;

type ConfettiCanvasProps = {
  containerStyle?: StyleProp<ViewStyle>;
  texture: AtlasComponentProps['image'];
  sprites: AtlasComponentProps['sprites'];
  transforms: AtlasComponentProps['transforms'];
  opacity: AtlasComponentProps['opacity'];
};

export function ConfettiCanvas({
  containerStyle,
  texture,
  sprites,
  transforms,
  opacity,
}: ConfettiCanvasProps) {
  return (
    <View pointerEvents="none" style={[styles.container, containerStyle]}>
      <Canvas style={styles.canvasContainer}>
        <Atlas
          image={texture}
          sprites={sprites}
          transforms={transforms}
          opacity={opacity}
        />
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
