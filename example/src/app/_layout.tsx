import { Stack } from 'expo-router';
import { Platform, useColorScheme } from 'react-native';
import { colors } from '../constants/colors';

function getIOSVersion(): number {
  if (Platform.OS !== 'ios') return 0;

  return parseInt(Platform.Version as string, 10);
}

function isIOS26OrLater(): boolean {
  return getIOSVersion() >= 26;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const titleColor = colorScheme === 'dark' ? '#fff' : '#000';

  return (
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
      <Stack.Screen name="pi" options={{ title: 'PI' }} />
      <Stack.Screen name="cannon" options={{ title: 'Cannon' }} />
    </Stack>
  );
}
