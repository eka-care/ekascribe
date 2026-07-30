'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import useVoice2RxStore from '@/store/store';
import { SESSION_PHASE } from '@/constants/enums';
import { useSessionLifecycle } from './use-session-lifecycle';

export function useKeyboardShortcuts() {
  const router = useRouter();
  const lifecycle = useSessionLifecycle();

  // Keep stable references so the effect never re-registers the listener.
  // Without this, every time startRecording's isStartSessionLoading dep
  // changes, the effect tears down and re-adds the keydown handler,
  // causing missed keypresses in the gap.
  const lifecycleRef = useRef(lifecycle);
  lifecycleRef.current = lifecycle;
  const routerRef = useRef(router);
  routerRef.current = router;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const modifierPressed = isMac ? e.ctrlKey : e.altKey;

      if (!modifierPressed) return;

      const store = useVoice2RxStore.getState();
      const recordingSessionId = store.sessionV2Ongoing.recording_session_id;
      const phase = recordingSessionId
        ? store.sessionV2ContentById[recordingSessionId]?.phase
        : undefined;
      const { startRecording, pauseRecording, resumeRecording, endRecording } =
        lifecycleRef.current;

      // If viewing a past session (/session/[id]), use that as fallback
      const viewedSessionId = window.location.pathname.match(/^\/session\/(.+)$/)?.[1] ?? null;

      switch (e.key.toLowerCase()) {
        case 's': {
          e.preventDefault();
          if (phase === SESSION_PHASE.RECORDING || phase === SESSION_PHASE.PAUSED) {
            endRecording();
          } else if (phase === SESSION_PHASE.IDLE && recordingSessionId) {
            startRecording(recordingSessionId);
          } else if (viewedSessionId) {
            const viewedPhase = store.sessionV2ContentById[viewedSessionId]?.phase;
            if (viewedPhase === SESSION_PHASE.IDLE) {
              startRecording(viewedSessionId);
            }
          }
          break;
        }
        case 'p': {
          e.preventDefault();
          if (phase === SESSION_PHASE.RECORDING) {
            pauseRecording();
          } else if (phase === SESSION_PHASE.PAUSED) {
            resumeRecording();
          }
          break;
        }
        case 'n': {
          e.preventDefault();
          if (phase === SESSION_PHASE.RECORDING || phase === SESSION_PHASE.PAUSED) {
            endRecording();
          }
          store.clearRecordingSessionId();
          store.refreshPastSessionsCallback?.();
          // Signals /new-session to create + auto-start instead of opening the latest session.
          store.setAutoStartRecording(true);
          routerRef.current.replace('/new-session');
          break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, []);
}
