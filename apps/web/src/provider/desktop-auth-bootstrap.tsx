'use client';

import { useEffect, useState } from 'react';
import { getHost, getNetwork, getAuthTokens, getPlatform } from '@/platform';
import { setTransport } from '@/transport';
import setEnv from '@/fetch-client/helper';

const isDesktop = getHost() === 'desktop';
console.log('[platform] getHost():', getHost(), '| isDesktop:', isDesktop);

/**
 * Desktop auth bootstrap. The Electron renderer has no eka.care cookies, so before the first
 * authenticated request (e.g. the protected route's whoami) we must:
 *   1. route requests through the host transport (the network capability backed by the host), and
 *   2. seed the host-injected token into the fetch-client.
 * Rendering of children is gated until that completes, so whoami runs authenticated and the app
 * doesn't fall through to the website login. On web this is a pass-through (nothing to bootstrap).
 */
export default function DesktopAuthBootstrap({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(!isDesktop);

  // Terminal-visible diagnostic — fires on mount.
  useEffect(() => {
    const tokenOk = !!getAuthTokens();
    const msg = `[bootstrap] getHost=${getHost()} isDesktop=${isDesktop} tokenAvailable=${tokenOk}`;
    console.log(msg);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isDesktop) return;
    let cancelled = false;

    // Route desktop requests through the host transport before any API call.
    const hostTransport = getNetwork();
    if (hostTransport) setTransport(hostTransport);

    // Seed the host-injected token, then let the gated children (and whoami) render.
    const authTokens = getAuthTokens();
    if (authTokens) {
      authTokens
        .getTokens()
        .then((tokens) => {
          if (tokens?.accessToken) {
            setEnv({ auth_token: tokens.accessToken, refresh_token: tokens.refreshToken });
          }
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setReady(true);
        });
    } else {
      if (!cancelled) setReady(true);
    }

    // The host may push fresh tokens later (re-login / refresh).
    const unsub = getPlatform().hostBridge?.onSetup((payload) => {
      const p = payload as { accessToken?: string | null; refreshToken?: string | null } | undefined;
      if (p?.accessToken) {
        setEnv({ auth_token: p.accessToken, refresh_token: p.refreshToken ?? undefined });
      }
    });

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, []);

  if (!ready) return null;
  return <>{children}</>;
}
