import { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Confetti } from 'react-native-fast-confetti';
import type { ConfettiMethods } from 'react-native-fast-confetti';
import { Controls } from './Controls';

export function SingleScreen() {
  const ref = useRef<ConfettiMethods>(null);

  return (
    <View style={styles.container}>
      <Confetti
        ref={ref}
        autoplay
        colors={['#FF6B00', '#FF006E', '#642CFF', '#FFC800']}
        count={90}
        flakeStyle="solid"
        flipIntensity={0.92}
        gravity={1}
      >
        <Confetti.Flake size={11} radius={5.5} />
        <Confetti.Flake width={8} height={17} radius={4} />
        <Confetti.Flake size={18} shape="heart" />
        <Confetti.Flake size={18} shape="star" />
        <Confetti.Flake size={17} shape="flower" />
        <Confetti.Flake width={24} height={17} shape="streamer" />
      </Confetti>
      <Controls confettiRef={ref} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
});
