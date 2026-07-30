'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';

import type { CapabilityId, CapabilitySet, HostId, PlatformImplementations } from './contracts';
import { getActiveCapabilities, getHost, getPlatform } from './registry';

interface PlatformContextValue {
  platform: PlatformImplementations;
  capabilities: CapabilitySet;
  host: HostId;
}

const PlatformContext = createContext<PlatformContextValue | null>(null);

/**
 * Provides the build-selected capabilities to React with a stable reference. Wrap the
 * app once (high in the tree). UI reads capabilities via `usePlatform` / `useCapabilities`
 * and never touches `window.*Api` or platform names (P1).
 */
export function PlatformProvider({ children }: { children: ReactNode }) {
  const value = useMemo<PlatformContextValue>(() => {
    const active = getActiveCapabilities();
    const capabilities: CapabilitySet = {
      has: (id: CapabilityId) => active.has(id),
      list: () => Array.from(active),
    };
    return { platform: getPlatform(), capabilities, host: getHost() };
  }, []);

  return <PlatformContext.Provider value={value}>{children}</PlatformContext.Provider>;
}

export function usePlatformContext(): PlatformContextValue {
  const ctx = useContext(PlatformContext);
  if (!ctx) {
    throw new Error('usePlatformContext must be used within a <PlatformProvider>');
  }
  return ctx;
}
