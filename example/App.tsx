import { Button, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SingleScreen } from './screens/SingleScreen';
import { ContinuousScreen } from './screens/ContinuousScreen';
import { PIScreen } from './screens/PIScreen';
import { CannonScreen } from './screens/CannonScreen';

type StackParamList = {
  Home: undefined;
  Single: undefined;
  Continuous: undefined;
  PI: undefined;
  Cannon: undefined;
};

const Stack = createNativeStackNavigator<StackParamList>();

const modes: { key: keyof StackParamList; label: string }[] = [
  { key: 'Single', label: 'Single' },
  { key: 'Continuous', label: 'Continuous' },
  { key: 'PI', label: 'PI' },
  { key: 'Cannon', label: 'Cannon' },
];

function HomeScreen({
  navigation,
}: NativeStackScreenProps<StackParamList, 'Home'>) {
  return (
    <View style={styles.home}>
      {modes.map((mode) => (
        <Button
          key={mode.key}
          title={mode.label}
          onPress={() => navigation.navigate(mode.key)}
        />
      ))}
    </View>
  );
}

export default function App() {
  return (
    <NavigationContainer>
      <StatusBar style="dark" />
      <Stack.Navigator>
        <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'Confetti Repro' }} />
        <Stack.Screen name="Single" component={SingleScreen} />
        <Stack.Screen name="Continuous" component={ContinuousScreen} />
        <Stack.Screen name="PI" component={PIScreen} />
        <Stack.Screen name="Cannon" component={CannonScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  home: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
});
