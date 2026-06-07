import { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { PIConfetti } from 'react-native-fast-confetti';
import type { PIConfettiMethods } from 'react-native-fast-confetti';
import { Controls } from './Controls';

export function PIScreen() {
  const ref = useRef<PIConfettiMethods>(null);

  return (
    <View style={styles.container}>
      <PIConfetti ref={ref} autoplay infinite>
        <PIConfetti.Origin blastPosition="center" count={200} initialSpeed={2}>
          <PIConfetti.Flake width={8} height={16} />
          <PIConfetti.Flake size={10} radius={2} />
        </PIConfetti.Origin>
      </PIConfetti>
      <Controls confettiRef={ref} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
});
