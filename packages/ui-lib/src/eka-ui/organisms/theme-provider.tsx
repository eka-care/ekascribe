// to support next.ts projects
'use client';

import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { generatePrimaryPalette } from '../utils/color';

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

export type CustomThemeVariables = Record<string, string>;

interface ThemeProviderProps {
  children: ReactNode;
  defaultTheme?: ThemeType;
  node?: HTMLElement;
  customVariables?: CustomThemeVariables;
  primaryColor?: string;
}

export function ThemeProvider({
  children,
  defaultTheme = 'doctor-light',
  node,
  customVariables,
  primaryColor,
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<ThemeType>(defaultTheme);

  const generatedPalette = useMemo(() => generatePrimaryPalette(primaryColor), [primaryColor]);

  const mergedVariables = useMemo(() => {
    if (!generatedPalette && !customVariables) return undefined;
    return { ...(generatedPalette ?? {}), ...(customVariables ?? {}) };
  }, [generatedPalette, customVariables]);

  useEffect(() => {
    const targetNode = node || (typeof document !== 'undefined' ? document.documentElement : null);
    if (!targetNode) return;

    targetNode.setAttribute('data-theme', theme);

    if (!mergedVariables) return;

    const previousValues: Record<string, string> = {};
    Object.entries(mergedVariables).forEach(([token, value]) => {
      previousValues[token] = targetNode.style.getPropertyValue(token);
      targetNode.style.setProperty(token, value);
    });

    return () => {
      Object.keys(mergedVariables).forEach((token) => {
        const previousValue = previousValues[token];
        if (previousValue) {
          targetNode.style.setProperty(token, previousValue);
        } else {
          targetNode.style.removeProperty(token);
        }
      });
    };
  }, [theme, node, mergedVariables]);

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
