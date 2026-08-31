import type { ReactNode } from 'react';
import type { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';

type Props = {
  children: ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
  onContainerLayout: (event: LayoutChangeEvent) => void;
};

export const GPUCanvasHost = ({
  children,
  containerStyle,
  onContainerLayout,
}: Props) => (
  <View
    pointerEvents="none"
    onLayout={onContainerLayout}
    style={[gpuCanvasStyles.container, containerStyle]}
  >
    {children}
  </View>
);

export const gpuCanvasStyles = StyleSheet.create({
  container: { ...StyleSheet.absoluteFill, zIndex: 1 },
  canvas: { flex: 1 },
});
