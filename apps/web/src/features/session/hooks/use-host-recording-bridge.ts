'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useHostBridge } from '@/platform';
import useVoice2RxStore from '@/store/store';
import { SESSION_PHASE } from '@/constants/enums';
import { useSessionLifecycle } from './use-session-lifecycle';

// Phases that, when left via IDLE/undefined, mean the session was discarded rather than completed.
// OUTPUT is excluded — the native "processed" overlay manages its own dismissal.
const DISCARD_TRIGGER_PHASES = new Set<string>([
  SESSION_PHASE.RECORDING,
  SESSION_PHASE.PAUSED,
  SESSION_PHASE.PROCESSING,
  SESSION_PHASE.ERROR,
]);

/**
 * Wires the host command bridge to the recording lifecycle. On desktop this drives the native
 * overlay state machine via updateStatus / notifyProcessingCompleted / notifyError /
 * notifySessionDiscarded. On web the bridge is a no-op so this hook is inert. Mount once,
 * high in the app.
 */
export function useHostRecordingBridge() {
  const hostBridge = useHostBridge();
  const router = useRouter();
  const { startRecording, endRecording, pauseRecording, resumeRecording } = useSessionLifecycle();

  const startRef = useRef(startRecording);
  const endRef = useRef(endRecording);
  const pauseRef = useRef(pauseRecording);
  const resumeRef = useRef(resumeRecording);
  startRef.current = startRecording;
  endRef.current = endRecording;
  pauseRef.current = pauseRecording;
  resumeRef.current = resumeRecording;

  useEffect(() => {
    if (!hostBridge) return;

    hostBridge.notifyRendererReady();

    const unsubStart = hostBridge.onStart(() => {
      const store = useVoice2RxStore.getState();
      store.clearRecordingSessionId();
      store.setAutoStartRecording(true);
      router.push('/new-session');
      window.dispatchEvent(new CustomEvent('scribe:start-new-session'));
    });
    const unsubStop = hostBridge.onStop(() => {
      void endRef.current();
    });
    const unsubSetup = hostBridge.onSetup((payload) => {
      console.log('[host-bridge] setup:', payload);
    });
    const unsubPause = hostBridge.onPause(() => {
      pauseRef.current();
    });
    const unsubResume = hostBridge.onResume(() => {
      resumeRef.current();
    });
    const unsubViewTxn = hostBridge.onViewTransaction((transactionId) => {
      router.push(`/session/${transactionId}`);
    });
    const unsubGetStatus = hostBridge.onGetStatusRequest(() => {
      const state = useVoice2RxStore.getState();
      const id = state.sessionV2Ongoing.recording_session_id;
      const phase = id ? state.sessionV2ContentById[id]?.phase : undefined;
      return {
        processingStatus: phase ?? 'idle',
        sessionId: id || null,
      };
    });

    return () => {
      unsubStart();
      unsubStop();
      unsubSetup();
      unsubPause();
      unsubResume();
      unsubViewTxn();
      unsubGetStatus();
    };
  }, [hostBridge, router]);

  // Use separate primitive selectors — returning an object causes Object.is to always differ,
  // triggering infinite re-renders via Zustand.
  const phase = useVoice2RxStore((s) => {
    const id = s.sessionV2Ongoing.recording_session_id;
    return id ? s.sessionV2ContentById[id]?.phase : undefined;
  });
  const sessionId = useVoice2RxStore((s) => s.sessionV2Ongoing.recording_session_id || null);
  const errorCode = useVoice2RxStore((s) => {
    const id = s.sessionV2Ongoing.recording_session_id;
    return id ? (s.sessionV2ContentById[id]?.error?.code ?? null) : null;
  });
  const errorMessage = useVoice2RxStore((s) => {
    const id = s.sessionV2Ongoing.recording_session_id;
    return id ? (s.sessionV2ContentById[id]?.error?.message ?? null) : null;
  });

  const prevPhaseRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!hostBridge) return;

    const prev = prevPhaseRef.current;
    prevPhaseRef.current = phase;

    switch (phase) {
      case SESSION_PHASE.RECORDING:
        hostBridge.updateStatus('recording', sessionId);
        break;
      case SESSION_PHASE.PAUSED:
        hostBridge.updateStatus('paused', sessionId);
        break;
      case SESSION_PHASE.PROCESSING:
        hostBridge.updateStatus('processing', sessionId);
        break;
      case SESSION_PHASE.OUTPUT:
        hostBridge.notifyProcessingCompleted(sessionId ?? '', 'completed');
        break;
      case SESSION_PHASE.ERROR:
        hostBridge.notifyError(
          errorCode ?? 'unknown_error',
          errorMessage ?? 'An error occurred.',
        );
        break;
      case SESSION_PHASE.IDLE:
      case undefined:
        if (prev && DISCARD_TRIGGER_PHASES.has(prev)) {
          hostBridge.notifySessionDiscarded();
        }
        break;
    }
  }, [hostBridge, phase, sessionId, errorCode, errorMessage]);
}
