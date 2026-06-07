import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import type { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';

export const useContainerDimensions = (
  containerStyle?: StyleProp<ViewStyle>
) => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const styleExtracted = useMemo(() => {
    const flat = StyleSheet.flatten(containerStyle);
    const width =
      typeof flat?.width === 'number' ? flat.width : null;
    const height =
      typeof flat?.height === 'number' ? flat.height : null;
    return { width, height };
  }, [containerStyle]);

  const [measured, setMeasured] = useState<{
    width: number;
    height: number;
  } | null>(null);

  const onContainerLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setMeasured((prev) => {
      if (prev?.width === width && prev?.height === height) return prev;
      return { width, height };
    });
  }, []);

  // If we have numeric style values, use them immediately (no layout wait).
  // Otherwise, wait for onLayout. Screen dimensions are the final fallback
  // only after onLayout has fired (to handle edge cases where layout is 0).
  const needsLayout =
    styleExtracted.width === null || styleExtracted.height === null;
  const ready = !needsLayout || measured !== null;

  const containerWidth =
    measured?.width ?? styleExtracted.width ?? screenWidth;
  const containerHeight =
    measured?.height ?? styleExtracted.height ?? screenHeight;

  return { containerWidth, containerHeight, onContainerLayout, ready };
};
