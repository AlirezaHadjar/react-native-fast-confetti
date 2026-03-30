import { View, StyleSheet } from 'react-native';
import { Button, Host } from '@expo/ui/jetpack-compose';

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
        <Host key={label} matchContents style={{ width: '100%' }}>
          <Button onPress={actionMap[label]}>{label}</Button>
        </Host>
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
});
