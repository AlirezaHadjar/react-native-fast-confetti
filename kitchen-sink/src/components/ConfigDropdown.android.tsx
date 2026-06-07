import { Pressable, Text as RNText, StyleSheet, View } from 'react-native';
import { MenuView } from '@expo/ui/community/menu';
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
  const selectedLabel =
    data.find((option) => option.value === value)?.label ?? '';

  return (
    <View style={styles.container}>
      <RNText style={styles.label}>{label}</RNText>
      <MenuView
        actions={data.map((option) => ({
          id: String(option.value),
          title: option.label,
          titleColor: colors.label,
        }))}
        onPressAction={(event) => {
          const selectedValue = data.find(
            (option) => String(option.value) === event.nativeEvent.event
          )?.value;

          if (selectedValue !== undefined) {
            onChange(selectedValue);
          }
        }}
      >
        <Pressable style={styles.trigger}>
          <RNText style={styles.triggerText}>{selectedLabel}</RNText>
        </Pressable>
      </MenuView>
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
  trigger: {
    minWidth: 120,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.separator,
    borderRadius: 20,
    backgroundColor: colors.background,
  },
  triggerText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.label,
  },
});
