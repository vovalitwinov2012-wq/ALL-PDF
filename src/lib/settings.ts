// Настройки пользователя в localStorage: переживают перезагрузку.
// Храним только простые значения (строки, числа, boolean, маленькие объекты).
const PREFIX = 'allpdf:';

export function loadSetting<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveSetting(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // приватный режим и т.п. — настройки просто не сохранятся
  }
}
