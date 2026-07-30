'use client';

import type { ReactNode } from 'react';
import type { CapabilityId } from '../contracts';
import { useCapabilities } from '../hooks';

/**
 * Renders its children only when the given capability descriptor is active in the current
 * build; otherwise renders `fallback` (default nothing). The preferred primitive for
 * gating on what the platform can *do* (AP-4) — e.g. `<Capability id="native-file-dialog">`.
 */
export function Capability({
  id,
  children,
  fallback = null,
}: {
  id: CapabilityId;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  return <>{useCapabilities().has(id) ? children : fallback}</>;
}
