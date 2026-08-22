import { Button, Host, Menu } from '@expo/ui/swift-ui';
import { StyleSheet } from 'react-native';

import { useRenderer } from '../hooks/useRenderer';

export function RendererMenu() {
  const { renderer, setRenderer } = useRenderer();

  return (
    <Host matchContents style={styles.host}>
      <Menu label="Renderer" systemImage="square.stack.3d.up">
        <Button
          label="WebGPU"
          systemImage={
            renderer === 'webgpu' ? 'checkmark.circle.fill' : 'circle'
          }
          onPress={() => setRenderer('webgpu')}
        />
        <Button
          label="Skia"
          systemImage={renderer === 'skia' ? 'checkmark.circle.fill' : 'circle'}
          onPress={() => setRenderer('skia')}
        />
      </Menu>
    </Host>
  );
}

const styles = StyleSheet.create({
  host: {
    height: 44,
    minWidth: 44,
  },
});
