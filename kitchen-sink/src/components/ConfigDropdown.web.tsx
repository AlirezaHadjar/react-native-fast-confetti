import * as Select from '@radix-ui/react-select';
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
  return (
    <div style={containerStyle}>
      <label style={labelStyle}>{label}</label>
      <Select.Root
        value={String(value)}
        onValueChange={(v) => {
          const parsed = Number(v);
          onChange((Number.isNaN(parsed) ? v : parsed) as T);
        }}
      >
        <Select.Trigger style={triggerStyle}>
          <Select.Value />
          <Select.Icon>
            <ChevronDown />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content style={contentStyle} position="popper" sideOffset={4}>
            <Select.Viewport style={viewportStyle}>
              {data.map((option) => (
                <Select.Item
                  key={String(option.value)}
                  value={String(option.value)}
                  style={itemStyle}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f4f4f5';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <Select.ItemText>{option.label}</Select.ItemText>
                  <Select.ItemIndicator style={indicatorStyle}>
                    <Check />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </div>
  );
}

function ChevronDown() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 15 15"
      fill="none"
      style={{ marginLeft: 4, opacity: 0.5 }}
    >
      <path
        d="M3.13523 6.15803C3.3241 5.95657 3.64052 5.94637 3.84197 6.13523L7.5 9.56464L11.158 6.13523C11.3595 5.94637 11.6759 5.95657 11.8648 6.15803C12.0536 6.35949 12.0434 6.67591 11.842 6.86477L7.84197 10.6148C7.64964 10.7951 7.35036 10.7951 7.15803 10.6148L3.15803 6.86477C2.95657 6.67591 2.94637 6.35949 3.13523 6.15803Z"
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
      />
    </svg>
  );
}

function Check() {
  return (
    <svg width="14" height="14" viewBox="0 0 15 15" fill="none">
      <path
        d="M11.4669 3.72684C11.7558 3.91574 11.8369 4.30308 11.648 4.59198L7.39799 11.092C7.29783 11.2452 7.13556 11.3467 6.95402 11.3699C6.77247 11.3931 6.58989 11.3354 6.45446 11.2124L3.70446 8.71241C3.44905 8.48022 3.43023 8.08494 3.66242 7.82953C3.89461 7.57412 4.28989 7.5553 4.5453 7.78749L6.75292 9.79441L10.6018 3.90792C10.7907 3.61902 11.178 3.53795 11.4669 3.72684Z"
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
      />
    </svg>
  );
}

const containerStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 600,
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
};

const labelStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  color: '#0a0a0a',
};

const triggerStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 4,
  height: 36,
  minWidth: 130,
  padding: '0 12px',
  fontSize: 14,
  lineHeight: 1,
  color: '#0a0a0a',
  backgroundColor: 'white',
  border: '1px solid #e4e4e7',
  borderRadius: 6,
  cursor: 'pointer',
  outline: 'none',
  boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
};

const contentStyle: React.CSSProperties = {
  backgroundColor: 'white',
  borderRadius: 6,
  border: '1px solid #e4e4e7',
  boxShadow:
    '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
  overflow: 'hidden',
  minWidth: 'var(--radix-select-trigger-width)',
  zIndex: 50,
  animationDuration: '150ms',
};

const viewportStyle: React.CSSProperties = {
  padding: 4,
};

const itemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '6px 8px 6px 32px',
  fontSize: 14,
  color: '#0a0a0a',
  borderRadius: 4,
  cursor: 'pointer',
  outline: 'none',
  position: 'relative',
  userSelect: 'none',
};

const indicatorStyle: React.CSSProperties = {
  position: 'absolute',
  left: 8,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
};
