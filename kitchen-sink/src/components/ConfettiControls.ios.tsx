import { View, StyleSheet } from 'react-native';
import { Button, Host } from '@expo/ui/swift-ui';
import { buttonStyle } from '@expo/ui/swift-ui/modifiers';

type Props = {
  actions: {
    resume: () => void;
    pause: () => void;
    restart: () => void;
    reset: () => void;
  };
};

const buttons = [
  { label: 'Resume' },
  { label: 'Pause' },
  { label: 'Restart' },
  { label: 'Reset' },
] as const;

export function ConfettiControls({ actions }: Props) {
  const actionMap = {
    Resume: actions.resume,
    Pause: actions.pause,
    Restart: actions.restart,
    Reset: actions.reset,
  };

  return (
    <View style={styles.container}>
      {buttons.map(({ label }) => (
        <Host key={label} style={{ height: 44, width: 90 }}>
          <Button
            label={label}
            onPress={actionMap[label]}
            modifiers={[buttonStyle('glassProminent')]}
          />
        </Host>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 20,
  },
});
