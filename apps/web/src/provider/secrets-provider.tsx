'use client';

import { useEffect, useRef } from 'react';
import { initTracking } from '@/analytics';

const SecretsProvider = ({ children }: { children: React.ReactNode }) => {
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    initTracking();
  }, []);

  return <>{children}</>;
};

export default SecretsProvider;
