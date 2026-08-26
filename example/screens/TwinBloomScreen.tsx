import { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { CannonConfetti, ConfettiPresets } from 'react-native-fast-confetti';
import type { CannonConfettiMethods } from 'react-native-fast-confetti';
import { Controls } from './Controls';

const twinBloomColors = ['#F6D61B', '#EE6A10', '#6F1EE8', '#B21FBA', '#DC1F5D'];

export function TwinBloomScreen() {
  const ref = useRef<CannonConfettiMethods>(null);
  const flakes = (
    <>
      <CannonConfetti.Flake size={32} radius={16} />
      <CannonConfetti.Flake width={44} height={16} radius={8} />
      <CannonConfetti.Flake size={28} radius={14} />
      <CannonConfetti.Flake width={36} height={16} radius={8} />
      <CannonConfetti.Flake size={36} shape="heart" />
      <CannonConfetti.Flake size={36} shape="star" />
      <CannonConfetti.Flake size={36} shape="flower" />
      <CannonConfetti.Flake width={56} height={40} shape="streamer" />
    </>
  );

  return (
    <View style={styles.container}>
      <CannonConfetti
        ref={ref}
        autoplay
        colors={twinBloomColors}
        particleSystem={ConfettiPresets.TwinBloom}
        reduceMotion="never"
        flakeStyle="solid"
      >
        <CannonConfetti.Origin position="center-left" count={20}>
          {flakes}
        </CannonConfetti.Origin>
        <CannonConfetti.Origin position="center-right" count={16}>
          {flakes}
        </CannonConfetti.Origin>
      </CannonConfetti>
      <Controls confettiRef={ref} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
});
