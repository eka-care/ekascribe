'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import SessionScreen from '@/features/session/screens/session-screen';

const SESSION_PATH = /^\/session\/([^/?#]+)/;

// The exported HTML shell is prerendered once with the placeholder id '_' and
// served for every /session/* path. On a direct page load Next hydrates its
// router state from that prerendered payload, so usePathname() can report
// '/session/_' instead of the real URL — the browser's location is the source
// of truth there. usePathname still matters for client-side navigations
// (sidebar session switches), where it updates and location matches.
const SessionClientPage = () => {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;
  const routeId = pathname?.match(SESSION_PATH)?.[1];
  const id =
    routeId && routeId !== '_'
      ? routeId
      : window.location.pathname.match(SESSION_PATH)?.[1];
  if (!id || id === '_') return null;
  return <SessionScreen key={id} sessionId={id} />;
};

export default SessionClientPage;
