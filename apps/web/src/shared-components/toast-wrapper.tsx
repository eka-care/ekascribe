'use client';

import { Toaster as SonnerToaster } from 'sonner';
import { useTheme } from '@ui/src';

export const ToastWrapper = () => {
  const { theme } = useTheme();

  const themeMode = theme.includes('dark') ? 'dark' : 'light';

  return (
    <SonnerToaster
      theme={themeMode}
      position="top-right"
      richColors
      closeButton
      expand
      style={
        {
          '--toast-close-button-start': 'unset',
          '--toast-close-button-end': '0',
          '--toast-close-button-transform': 'translate(35%, -35%)',
          '--warning-bg': '#FFF3CD',
          '--warning-border': '#B45309',
          '--warning-text': '#B45309',
        } as React.CSSProperties
      }
    />
  );
};
