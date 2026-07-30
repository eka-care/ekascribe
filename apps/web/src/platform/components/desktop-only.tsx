'use client';

import type { ReactNode } from 'react';
import { useHost } from '../hooks';

/**
 * Renders its children only on the desktop (Electron) host; otherwise renders `fallback`
 * (default nothing). The host check is centralized here (AP-4) so feature code stays
 * declarative — `<DesktopOnly>…</DesktopOnly>` — and never sniffs the platform itself.
 *
 * Render-only: children are still bundled on web, just not shown. For behaviour that
 * depends on what the platform can *do*, use `<Capability>` instead.
 */
export function DesktopOnly({
  children,
  fallback = null,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  return <>{useHost() === 'desktop' ? children : fallback}</>;
}
