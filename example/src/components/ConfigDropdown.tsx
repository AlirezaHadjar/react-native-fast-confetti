import { View, Text, StyleSheet } from 'react-native';
import { Dropdown } from 'react-native-element-dropdown';
import type { DropdownOption } from '../constants/config';

type Props<T> = {
  label: string;
  data: DropdownOption<T>[];
  value: T;
  onChange: (value: T) => void;
};

export function ConfigDropdown<T>({ label, data, value, onChange }: Props<T>) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <Dropdown
        style={styles.dropdown}
        placeholderStyle={styles.placeholderStyle}
        selectedTextStyle={styles.selectedTextStyle}
        data={data}
        labelField="label"
        valueField="value"
        placeholder={`Select ${label.toLowerCase()}`}
        value={value}
        onChange={(item: DropdownOption<T>) => onChange(item.value)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 5,
    color: '#333',
  },
  dropdown: {
    height: 50,
    borderColor: '#ddd',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: '#f9f9f9',
  },
  placeholderStyle: {
    fontSize: 16,
    color: '#999',
  },
  selectedTextStyle: {
    fontSize: 16,
    color: '#333',
  },
});
