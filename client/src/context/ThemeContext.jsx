/**
 * ThemeContext — provides light/dark mode toggling with localStorage persistence.
 *
 * Design tokens are applied via a `data-theme` attribute on <html>, which
 * drives CSS custom properties defined in index.css.  Components never need
 * to know the raw hex values — they reference `var(--bg)`, `var(--surface)`, etc.
 *
 * On first load the context checks:
 *   1. localStorage("byteguard-theme")
 *   2. prefers-color-scheme media query
 * and falls back to "dark" if neither is set.
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const ThemeContext = createContext();

/** Read the persisted theme or derive it from system preference. */
function getInitialTheme() {
  try {
    const stored = localStorage.getItem('byteguard-theme');
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    /* localStorage may be blocked — fall through */
  }
  if (window.matchMedia?.('(prefers-color-scheme: light)').matches) return 'light';
  return 'dark';
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(getInitialTheme);

  /* Apply the data attribute + persist whenever theme changes */
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('byteguard-theme', theme); } catch { /* ignore */ }
  }, [theme]);

  /** Toggle between light ↔ dark */
  const toggleTheme = useCallback(() => {
    setThemeState(prev => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  /** Explicitly set a theme */
  const setTheme = useCallback((t) => {
    if (t === 'light' || t === 'dark') setThemeState(t);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

/** Convenience hook — call `useTheme()` in any component */
export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within <ThemeProvider>');
  return ctx;
}
