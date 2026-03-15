import { useState } from 'react';
import { Text as RNText, StyleSheet, View } from 'react-native';
import { ContextMenu, Button, Host } from '@expo/ui/jetpack-compose';
import { colors } from '../constants/colors';
import type { DropdownOption } from '../constants/config';

type Props<T extends string | number> = {
  label: string;
  data: DropdownOption<T>[];
  value: T;
  onChange: (value: T) => void;
};

export function ConfigDropdown<T extends string | number>({
  label,
  data,
  value,
  onChange,
}: Props<T>) {
  const [expanded, setExpanded] = useState(false);
  const selectedLabel =
    data.find((option) => option.value === value)?.label ?? '';

  return (
    <View style={styles.container}>
      <RNText style={styles.label}>{label}</RNText>
      <Host matchContents>
        <ContextMenu>
          <ContextMenu.Trigger>
            <Button
              variant="bordered"
              onPress={() => setExpanded(!expanded)}
            >
              {selectedLabel}
            </Button>
          </ContextMenu.Trigger>
          <ContextMenu.Items>
            {data.map((option) => (
              <Button
                key={String(option.value)}
                onPress={() => {
                  onChange(option.value);
                  setExpanded(false);
                }}
              >
                {option.label}
              </Button>
            ))}
          </ContextMenu.Items>
        </ContextMenu>
      </Host>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.label,
  },
});
