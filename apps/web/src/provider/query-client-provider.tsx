'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PropsWithChildren, useMemo } from 'react';

export default function QueryClientRootProvider({ children }: PropsWithChildren) {
  const client = useMemo(() => new QueryClient(), []);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
