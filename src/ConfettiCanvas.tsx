import type { ComponentProps } from 'react';
import { Canvas, Atlas } from '@shopify/react-native-skia';
import { StyleSheet, View } from 'react-native';
import type { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';

type AtlasComponentProps = ComponentProps<typeof Atlas>;

type ConfettiCanvasProps = {
  containerStyle?: StyleProp<ViewStyle>;
  ready: boolean;
  texture: AtlasComponentProps['image'];
  sprites: AtlasComponentProps['sprites'];
  transforms: AtlasComponentProps['transforms'];
  opacity: AtlasComponentProps['opacity'];
  onContainerLayout?: (e: LayoutChangeEvent) => void;
};

export function ConfettiCanvas({
  containerStyle,
  ready,
  texture,
  sprites,
  transforms,
  opacity,
  onContainerLayout,
}: ConfettiCanvasProps) {
  return (
    <View
      pointerEvents="none"
      style={[styles.container, containerStyle]}
      onLayout={onContainerLayout}
    >
      <Canvas style={styles.canvasContainer}>
        {ready ? (
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
