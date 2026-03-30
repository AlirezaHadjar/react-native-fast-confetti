import { View, StyleSheet, Pressable, Text } from 'react-native';

type Props = {
  actions: {
    resume: () => void;
    pause: () => void;
    restart: () => void;
    reset: () => void;
  };
};

const buttons = ['Resume', 'Pause', 'Restart', 'Reset'] as const;

export function ConfettiControls({ actions }: Props) {
  const actionMap = {
    Resume: actions.resume,
    Pause: actions.pause,
    Restart: actions.restart,
    Reset: actions.reset,
  };

  return (
    <View style={styles.container}>
      {buttons.map((label) => (
        <Pressable
          key={label}
          style={styles.button}
          onPress={actionMap[label]}
        >
          <Text style={styles.buttonText}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'center',
    width: '100%',
    marginTop: 20,
  },
  button: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(120, 120, 128, 0.12)',
    borderRadius: 8,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
  },
});
