import { useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  Button,
  useWindowDimensions,
  Switch,
  Text,
} from 'react-native';
import { Confetti, PIConfetti } from 'react-native-fast-confetti';
import type {
  ConfettiMethods,
  ConfettiProps,
} from 'react-native-fast-confetti';

export default function App() {
  const confettiRef = useRef<ConfettiMethods>(null);
  const { height, width } = useWindowDimensions();
  const [isPIConfetti, setIsPIConfetti] = useState(false);
  const [cannons, setCannons] = useState(false);

  const cannonPositions: ConfettiProps['cannonsPositions'] = [
    { x: -30, y: height },
    { x: width + 30, y: height },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.switchContainer}>
        <Text>Regular Confetti</Text>
        <Switch
          value={isPIConfetti}
          onValueChange={setIsPIConfetti}
          trackColor={{ false: '#767577', true: '#81b0ff' }}
        />
        <Text>PI Confetti</Text>
      </View>
      {!isPIConfetti && (
        <View style={styles.switchContainer}>
          <Text>Regular Confetti</Text>
          <Switch
            value={cannons}
            onValueChange={setCannons}
            trackColor={{ false: '#767577', true: '#81b0ff' }}
          />
          <Text>Cannons Confetti</Text>
        </View>
      )}

      {isPIConfetti ? (
        <PIConfetti
          ref={confettiRef}
          autoplay={true}
          fallDuration={2000}
          blastDuration={250}
          sizeVariation={0.3}
          radiusRange={[0, 15]}
          flakeSize={{ width: 18, height: 12 }}
        />
      ) : (
        <Confetti
          ref={confettiRef}
          autoplay={true}
          verticalSpacing={cannons ? 0 : 20}
          cannonsPositions={cannons ? cannonPositions : undefined}
          radiusRange={[0, 15]}
          sizeVariation={0.5}
          flakeSize={{ width: 15, height: 10 }}
          count={500}
        />
      )}

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
  switchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 8,
  },
});
