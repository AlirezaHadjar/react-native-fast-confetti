import { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Confetti } from 'react-native-fast-confetti';
import type { ConfettiMethods } from 'react-native-fast-confetti';
import { Controls } from './Controls';

export function SingleScreen() {
  const ref = useRef<ConfettiMethods>(null);

  return (
    <View style={styles.container}>
      <Confetti ref={ref} autoplay count={400} infinite gravity={1}>
        <Confetti.Flake size={12} radius={6} />
        <Confetti.Flake width={8} height={14} />
        <Confetti.Flake width={8} height={14} radius={6.5} />
        <Confetti.Flake width={8} height={14} radius={4} />
      </Confetti>
      <Controls confettiRef={ref} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
});
