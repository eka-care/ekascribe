'use client';

import type { ReactNode } from 'react';
import { useHost } from '../hooks';

/**
 * Renders its children only on the web host; otherwise renders `fallback` (default
 * nothing). Counterpart of `<DesktopOnly>` — the host check stays inside the platform
 * layer so feature code remains declarative (AP-4).
 */
export function WebOnly({
  children,
  fallback = null,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  return <>{useHost() === 'web' ? children : fallback}</>;
}
