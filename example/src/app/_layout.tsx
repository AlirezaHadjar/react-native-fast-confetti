import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Confetti Modes' }} />
      <Stack.Screen name="single" options={{ title: 'Single' }} />
      <Stack.Screen name="continuous" options={{ title: 'Continuous' }} />
      <Stack.Screen name="pi" options={{ title: 'PI' }} />
      <Stack.Screen name="cannon" options={{ title: 'Cannon' }} />
    </Stack>
  );
}
