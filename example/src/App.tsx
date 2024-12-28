import { useRef } from 'react';
import { StyleSheet, View, Button, useWindowDimensions } from 'react-native';
import { Confetti } from 'react-native-fast-confetti';
import type {
  ConfettiMethods,
  ConfettiProps,
} from 'react-native-fast-confetti';

export default function App() {
  const confettiRef = useRef<ConfettiMethods>(null);
  const { height, width } = useWindowDimensions();

  const cannonPositions: ConfettiProps['cannonsPositions'] = [
    { x: -30, y: 600 },
    { x: -30, y: height },
    { x: width + 30, y: 600 },
    { x: width + 30, y: height },
  ];

  return (
    <View style={styles.container}>
      <Confetti
        ref={confettiRef}
        autoplay={true}
        fallDuration={8000}
        verticalSpacing={20}
        cannonsPositions={cannonPositions}
        sizeVariation={0.1}
        fadeOutOnEnd
      />
      <Button title="Resume" onPress={() => confettiRef.current?.resume()} />
      <Button title="Pause" onPress={() => confettiRef.current?.pause()} />
      <Button title="Restart" onPress={() => confettiRef.current?.restart()} />
      <Button title="Reset" onPress={() => confettiRef.current?.reset()} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: 'white',
    justifyContent: 'center',
  },
});
