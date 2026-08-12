'use client';

import { useEffect } from 'react';
import useVoice2RxStore from '@/store/store';
import { with401Retry } from '@/fetch-client/api-with-retry';
import * as sdkService from '../services/sdk-service';
import { SESSION_PHASE } from '@/constants/enums';

export function useBeforeUnload() {
  const recordingSessionId = useVoice2RxStore((s) => s.sessionV2Ongoing.recording_session_id);
  const phase = useVoice2RxStore(
    (s) => s.sessionV2ContentById[s.sessionV2Ongoing.recording_session_id]?.phase
  );

  const isRecordingActive = phase === SESSION_PHASE.RECORDING || phase === SESSION_PHASE.PAUSED;

  useEffect(() => {
    if (!isRecordingActive) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };

    const handleUnload = () => {
      try {
        with401Retry(
          () => sdkService.cancelSession(recordingSessionId),
          'cancel session on unload'
        );
      } catch (e) {
        console.error('cancelSession failed during unload:', e);
      }

      useVoice2RxStore.getState().clearRecordingSessionId();
      useVoice2RxStore.getState().clearSessionState();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('unload', handleUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('unload', handleUnload);
    };
  }, [isRecordingActive, recordingSessionId]);
}
