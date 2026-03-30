import { Text as RNText, StyleSheet, View } from 'react-native';
import { Picker, Text, Host } from '@expo/ui/swift-ui';
import { pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import type { DropdownOption } from '../constants/config';
import { colors } from '../constants/colors';

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
  return (
    <View style={styles.container}>
      <RNText style={styles.label}>{label}</RNText>
      <Host style={{ height: 44, width: 120 }}>
        <Picker
          modifiers={[pickerStyle('menu')]}
          selection={value}
          onSelectionChange={(v: T) => onChange(v)}
        >
          {data.map((option) => (
            <Text key={String(option.value)} modifiers={[tag(option.value)]}>
              {option.label}
            </Text>
          ))}
        </Picker>
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
