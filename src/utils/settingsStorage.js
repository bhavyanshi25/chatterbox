const PREFIX = 'chatapp_settings_';

export function getSetting(key, defaultValue) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw === null) return defaultValue;
    return JSON.parse(raw);
  } catch {
    return defaultValue;
  }
}

export function setSetting(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // storage might be full or blocked — fail silently, setting just won't persist
  }
}