import type { DropdownOption } from '../constants/config';

type Props<T extends string | number> = {
  label: string;
  data: DropdownOption<T>[];
  value: T;
  onChange: (value: T) => void;
};

export function ConfigDropdown<T extends string | number>(props: Props<T>): React.JSX.Element;
