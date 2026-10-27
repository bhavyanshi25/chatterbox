import { useEffect, useState } from 'react';

const jsonOptions = { serialize: JSON.stringify, deserialize: JSON.parse };

function readValue(key, initialValue, deserialize) {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw !== null) return deserialize(raw);
  } catch {
    // blocked storage or malformed data — fall back to the initial value
  }
  return typeof initialValue === 'function' ? initialValue() : initialValue;
}

// useState that is read from and written back to localStorage.
// Storage errors (private mode, quota exceeded, malformed JSON) never throw —
// the state keeps working in memory, it just won't persist.
// `options` should be a stable (module-level) object so the write effect
// doesn't re-run on every render.
export function useLocalStorage(key, initialValue, options = jsonOptions) {
  const { serialize = JSON.stringify, deserialize = JSON.parse } = options;
  const [value, setValue] = useState(() => readValue(key, initialValue, deserialize));

  useEffect(() => {
    try {
      window.localStorage.setItem(key, serialize(value));
    } catch {
      // quota exceeded or storage blocked — keep the in-memory value
    }
  }, [key, value, serialize]);

  return [value, setValue];
}
