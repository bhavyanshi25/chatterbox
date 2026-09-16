import { createContext, useContext, useState } from 'react';
import { getSetting, setSetting } from '../utils/settingsStorage';

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [soundEnabled, setSoundEnabledState] = useState(() =>
    getSetting('soundEnabled', true)
  );
  const [effectsEnabled, setEffectsEnabledState] = useState(() =>
    getSetting('effectsEnabled', true)
  );

  const toggleSound = () => {
    setSoundEnabledState((prev) => {
      const next = !prev;
      setSetting('soundEnabled', next);
      return next;
    });
  };

  const toggleEffects = () => {
    setEffectsEnabledState((prev) => {
      const next = !prev;
      setSetting('effectsEnabled', next);
      return next;
    });
  };

  return (
    <SettingsContext.Provider
      value={{ soundEnabled, toggleSound, effectsEnabled, toggleEffects }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}