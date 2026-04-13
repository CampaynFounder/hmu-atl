'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';

type Theme = 'dark' | 'light';

interface ThemeState {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeState>({
  theme: 'dark',
  toggle: () => {},
  setTheme: () => {},
});

export function AdminThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('admin-theme') as Theme | null;
    if (saved === 'light' || saved === 'dark') setThemeState(saved);
    setMounted(true);
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    localStorage.setItem('admin-theme', t);
  }, []);

  const toggle = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  // Prevent flash of wrong theme
  if (!mounted) {
    return (
      <div data-theme="dark" className="admin-theme">
        <ThemeContext.Provider value={{ theme: 'dark', toggle, setTheme }}>
          {children}
        </ThemeContext.Provider>
      </div>
    );
  }

  return (
    <div data-theme={theme} className="admin-theme">
      <ThemeContext.Provider value={{ theme, toggle, setTheme }}>
        {children}
      </ThemeContext.Provider>
    </div>
  );
}

export function useAdminTheme() {
  return useContext(ThemeContext);
}
