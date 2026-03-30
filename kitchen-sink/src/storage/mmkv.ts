import { createMMKV } from 'react-native-mmkv';

const storage = createMMKV({ id: 'confetti-example' });

export function getJSON<T>(key: string, fallback: T): T {
  const value = storage.getString(key);
  if (value === undefined) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function setJSON<T>(key: string, value: T): void {
  storage.set(key, JSON.stringify(value));
}
