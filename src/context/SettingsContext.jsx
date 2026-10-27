import { createContext, useContext } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [soundEnabled, setSoundEnabled] = useLocalStorage('chatapp_settings_soundEnabled', true);
  const [effectsEnabled, setEffectsEnabled] = useLocalStorage('chatapp_settings_effectsEnabled', true);

  const toggleSound = () => setSoundEnabled((prev) => !prev);
  const toggleEffects = () => setEffectsEnabled((prev) => !prev);

  return (
    <SettingsContext.Provider
      value={{ soundEnabled, toggleSound, effectsEnabled, toggleEffects }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
