import { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { CannonConfetti } from 'react-native-fast-confetti';
import type { CannonConfettiMethods } from 'react-native-fast-confetti';
import { Controls } from './Controls';

export function CannonScreen() {
  const ref = useRef<CannonConfettiMethods>(null);

  return (
    <View style={styles.container}>
      <CannonConfetti
        ref={ref}
        autoplay
        fadeOutOnEnd
        infinite
        initialScale={0.7}
      >
        <CannonConfetti.Origin
          position="bottom-left"
          count={150}
          initialSpeed={3}
          depth={{ min: 1, max: 1.1 }}
        >
          <CannonConfetti.Flake size={12} radius={6} />
          <CannonConfetti.Flake width={8} height={14} />
        </CannonConfetti.Origin>
        <CannonConfetti.Origin
          position="bottom-right"
          count={150}
          initialSpeed={3}
          depth={{ min: 1, max: 1.1 }}
        >
          <CannonConfetti.Flake size={12} radius={6} />
          <CannonConfetti.Flake width={8} height={14} />
        </CannonConfetti.Origin>
        <CannonConfetti.Origin
          position="bottom-center"
          count={150}
          initialSpeed={4}
          target="center"
        >
          <CannonConfetti.Flake size={12} radius={6} />
          <CannonConfetti.Flake width={8} height={14} />
        </CannonConfetti.Origin>
      </CannonConfetti>
      <Controls confettiRef={ref} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
});
