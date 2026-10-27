import { createContext, useContext, useEffect } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';

const ThemeContext = createContext(null);

// Stored as a raw string ("light" / "dark") for compatibility with existing saved values.
const rawThemeStorage = {
  serialize: String,
  deserialize: (raw) => (raw === 'dark' ? 'dark' : 'light'),
};

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useLocalStorage('chatapp_theme', 'light', rawThemeStorage);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === 'light' ? 'dark' : 'light'));

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
