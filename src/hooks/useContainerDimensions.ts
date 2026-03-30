import { useMemo } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

export const useContainerDimensions = (
  containerStyle?: StyleProp<ViewStyle>
) => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  return useMemo(() => {
    const flat = StyleSheet.flatten(containerStyle);
    const containerWidth =
      (typeof flat?.width === 'number' ? flat.width : null) ?? screenWidth;
    const containerHeight =
      (typeof flat?.height === 'number' ? flat.height : null) ?? screenHeight;
    return { containerWidth, containerHeight };
  }, [containerStyle, screenWidth, screenHeight]);
};
