export function getJSON<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    if (value === null) return fallback;
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function setJSON<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}
