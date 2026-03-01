import { View, Button, StyleSheet } from 'react-native';

type Props = {
  actions: {
    resume: () => void;
    pause: () => void;
    restart: () => void;
    reset: () => void;
  };
};

export function ConfettiControls({ actions }: Props) {
  return (
    <View style={styles.container}>
      <Button title="Resume" onPress={actions.resume} />
      <Button title="Pause" onPress={actions.pause} />
      <Button title="Restart" onPress={actions.restart} />
      <Button title="Reset" onPress={actions.reset} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 20,
    paddingHorizontal: 20,
  },
});
