import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { Platform, useColorScheme, View } from 'react-native';
import { colors } from '../constants/colors';

function useWebFontFix() {
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const style = document.createElement('style');
    style.textContent = `
      * {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
          Helvetica, Arial, sans-serif !important;
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);
}

function getIOSVersion(): number {
  if (Platform.OS !== 'ios') return 0;

  return parseInt(Platform.Version as string, 10);
}

function isIOS26OrLater(): boolean {
  return getIOSVersion() >= 26;
}

export default function RootLayout() {
  useWebFontFix();
  const colorScheme = useColorScheme();
  const titleColor = colorScheme === 'dark' ? '#fff' : '#000';

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: colors.background },
          fullScreenGestureEnabled: true,
          headerBackButtonDisplayMode: 'minimal',
          headerBlurEffect: Platform.OS === 'ios' ? 'none' : undefined,
          headerTransparent: Platform.OS === 'ios',
          headerStyle:
            Platform.OS === 'android'
              ? { backgroundColor: colors.background as string }
              : undefined,
          headerTintColor: titleColor,
          headerTitleAlign: 'center',
          headerShadowVisible: false,
          headerTitleStyle: { color: titleColor },
        }}
      >
        <Stack.Screen
          name="index"
          options={{
            headerLargeTitle: true,
            headerTransparent: Platform.OS === 'ios',
            headerBlurEffect: isIOS26OrLater() ? undefined : 'regular',
            headerTitle: 'Confetti Modes',
            headerLargeTitleStyle: { color: titleColor },
            headerTitleStyle: { color: titleColor },
          }}
        />
        <Stack.Screen name="single" options={{ title: 'Single' }} />
        <Stack.Screen name="continuous" options={{ title: 'Continuous' }} />
        <Stack.Screen name="gpu" options={{ title: 'WebGPU' }} />
        <Stack.Screen name="pi" options={{ title: 'PI' }} />
        <Stack.Screen name="cannon" options={{ title: 'Cannon' }} />
      </Stack>
    </View>
  );
}
