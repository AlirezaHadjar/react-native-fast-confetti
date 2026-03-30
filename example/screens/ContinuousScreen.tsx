import { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { ContinuousConfetti } from 'react-native-fast-confetti';
import type { ConfettiMethods } from 'react-native-fast-confetti';
import { Controls } from './Controls';

export function ContinuousScreen() {
  const ref = useRef<ConfettiMethods>(null);

  return (
    <View style={styles.container}>
      <ContinuousConfetti ref={ref} autoplay count={200}>
        <ContinuousConfetti.Flake size={12} radius={6} />
        <ContinuousConfetti.Flake width={15} height={8} />
      </ContinuousConfetti>
      <Controls confettiRef={ref} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
});
