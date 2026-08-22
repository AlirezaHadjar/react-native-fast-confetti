import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { Platform, useColorScheme, View } from 'react-native';
import { RendererMenu } from '../components/RendererMenu';
import { colors } from '../constants/colors';
import { RendererProvider } from '../hooks/useRenderer';

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

export default function RootLayout() {
  useWebFontFix();
  const colorScheme = useColorScheme();
  const titleColor = colorScheme === 'dark' ? '#fff' : '#000';

  return (
    <RendererProvider>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <Stack
          screenOptions={{
            contentStyle: { backgroundColor: colors.background },
            fullScreenGestureEnabled: true,
            headerBackButtonDisplayMode: 'minimal',
            headerBlurEffect: Platform.OS === 'ios' ? 'none' : undefined,
            headerRight: () => <RendererMenu />,
            headerTransparent: false,
            headerStyle: { backgroundColor: colors.background as string },
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
              headerTransparent: false,
              headerBlurEffect: Platform.OS === 'ios' ? 'none' : undefined,
              headerTitle: 'Confetti Modes',
              headerLargeTitleStyle: { color: titleColor },
              headerTitleStyle: { color: titleColor },
            }}
          />
          <Stack.Screen name="single" options={{ title: 'Single' }} />
          <Stack.Screen name="continuous" options={{ title: 'Continuous' }} />
          <Stack.Screen name="pi" options={{ title: 'PI' }} />
          <Stack.Screen name="cannon" options={{ title: 'Cannon' }} />
          <Stack.Screen
            name="profile-webgpu"
            options={{ title: 'WebGPU Profile' }}
          />
        </Stack>
      </View>
    </RendererProvider>
  );
}
