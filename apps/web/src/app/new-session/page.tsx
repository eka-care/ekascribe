'use client';

import SessionScreen from '@/features/session/screens/session-screen';
import useVoice2RxStore from '@/store/store';
import { detectUserRegion } from '@/utils/geolocation';
import { useEffect, useRef, useState } from 'react';

export default function Home() {
  const setUserRegion = useVoice2RxStore((state) => state.setUserRegion);
  const sessionId = useVoice2RxStore((state) => state.sessionV2Ongoing.recording_session_id);
  const [mountKey, setMountKey] = useState(0);
  const prevSessionIdRef = useRef(sessionId);

  useEffect(() => {
    detectUserRegion().then((regionInfo) => {
      setUserRegion(regionInfo);
    });
  }, []);

  // Remount when the session changes (discard, or new session replacing an old one),
  // NOT when the first session is created (empty → session_id).
  useEffect(() => {
    const prev = prevSessionIdRef.current;
    prevSessionIdRef.current = sessionId;
    if (prev && prev !== sessionId) {
      setMountKey((k) => k + 1);
    }
  }, [sessionId]);

  // Host bridge / keyboard shortcut event — only acts when sessionId was already empty
  // (the watcher above handles non-empty → changed transitions, so skip to avoid double remount).
  useEffect(() => {
    const handleStartNew = () => {
      if (!prevSessionIdRef.current) {
        setMountKey((k) => k + 1);
      }
    };
    window.addEventListener('scribe:start-new-session', handleStartNew);
    return () => window.removeEventListener('scribe:start-new-session', handleStartNew);
  }, []);

  return <SessionScreen key={mountKey} />;
}
