import { type RefObject } from 'react';
import { Button, StyleSheet, View } from 'react-native';

type ConfettiRef = {
  restart: (...args: never[]) => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
};

type ControlsProps = {
  confettiRef: RefObject<ConfettiRef | null>;
};

export function Controls({ confettiRef }: ControlsProps) {
  return (
    <View style={styles.container}>
      <Button title="Restart" onPress={() => confettiRef.current?.restart()} />
      <Button title="Pause" onPress={() => confettiRef.current?.pause()} />
      <Button title="Resume" onPress={() => confettiRef.current?.resume()} />
      <Button title="Reset" onPress={() => confettiRef.current?.reset()} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    gap: 8,
    padding: 16,
  },
});
