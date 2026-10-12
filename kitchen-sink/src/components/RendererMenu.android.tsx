import { Pressable, StyleSheet, Text } from 'react-native';

import { useRenderer } from '../hooks/useRenderer';

export function RendererMenu() {
  const { renderer, setRenderer } = useRenderer();
  const nextRenderer = renderer === 'webgpu' ? 'skia' : 'webgpu';

  return (
    <Pressable
      accessibilityLabel={`Renderer: ${renderer}`}
      onPress={() => setRenderer(nextRenderer)}
      style={styles.button}
    >
      <Text style={styles.label}>{renderer === 'webgpu' ? 'GPU' : 'Skia'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { paddingHorizontal: 12, paddingVertical: 8 },
  label: { color: '#007AFF', fontWeight: '600' },
});
