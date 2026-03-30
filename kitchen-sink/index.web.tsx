import '@expo/metro-runtime';
import { App } from 'expo-router/build/qualified-entry';
import { renderRootComponent } from 'expo-router/build/renderRootComponent';
import { LoadSkiaWeb } from '@shopify/react-native-skia/lib/module/web';
import { version } from 'canvaskit-wasm/package.json';

LoadSkiaWeb({
  locateFile: (file: string) =>
    `https://cdn.jsdelivr.net/npm/canvaskit-wasm@${version}/bin/full/${file}`,
}).then(async () => {
  renderRootComponent(App);
});
