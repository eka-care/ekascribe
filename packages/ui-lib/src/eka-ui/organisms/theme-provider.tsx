// to support next.ts projects
'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

export type ThemeType =
  | 'patient-light'
  | 'patient-dark'
  | 'doctor-light'
  | 'doctor-dark'
  | 'client';

interface ThemeContextType {
  theme: ThemeType;
  setTheme: (theme: ThemeType) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({
  children,
  defaultTheme = 'doctor-light',
  node,
}: {
  children: ReactNode;
  defaultTheme?: ThemeType;
  node?: HTMLElement;
}) {
  const [theme, setThemeState] = useState<ThemeType>(defaultTheme);

  useEffect(() => {
    const targetNode = node || (typeof document !== 'undefined' ? document.documentElement : null);
    if (targetNode) {
      targetNode.setAttribute('data-theme', theme);
    }
  }, [theme, node]);

  const setTheme = (newTheme: ThemeType) => {
    setThemeState(newTheme);
  };

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
