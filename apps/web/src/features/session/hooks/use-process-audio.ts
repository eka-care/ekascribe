'use client';

import { useCallback, useState } from 'react';
import useVoice2RxStore from '@/store/store';
import { with401Retry } from '@/fetch-client/api-with-retry';
import * as sdkService from '../services/sdk-service';
import { pollSessionInBackground } from '../services/session-loader';
import { useSessionLifecycle } from './use-session-lifecycle';
import { SESSION_PHASE } from '@/constants/enums';
import { tracker } from '@/analytics';

export function useProcessAudio() {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { createSession } = useSessionLifecycle();

  const processAudio = useCallback(async (): Promise<boolean> => {
    if (isLoading || !audioFile) return false;

    setIsLoading(true);
    const store = useVoice2RxStore.getState();

    try {
      // Flow 6: ensure session exists, passing current patient if available
      const recordingSessionId = store.sessionV2Ongoing.recording_session_id;
      const currentPatient = recordingSessionId
        ? store.sessionV2ContentById[recordingSessionId]?.patient_details
        : null;

      const sessionId = await createSession({
        patient_details: currentPatient,
        upload_type: 'single',
      });

      if (!sessionId) {
        store.setWarningInfo({
          screen: 'upload_audio',
          message: 'Failed to start session. Please try again.',
        });
        setIsLoading(false);
        return false;
      }

      const uploadInfo = useVoice2RxStore.getState().sessionV2ContentById[sessionId]?.upload_url;

      if (!uploadInfo || Object.keys(uploadInfo).length === 0) {
        store.setWarningInfo({
          screen: 'upload_audio',
          message: 'Failed to get upload URL. Please try again.',
        });
        setIsLoading(false);
        return false;
      }

      tracker.log({
        name: 'upload_audio_to_notes',
        properties: { session_id: sessionId },
      });

      // Upload audio via SDK
      await with401Retry(
        () =>
          sdkService.processPreRecordedAudio({
            upload: uploadInfo,
            audioFile,
          }),
        'process pre-recorded audio'
      );

      // End session to trigger processing
      await with401Retry(
        () =>
          sdkService.endSession(
            {
              audio_files_sent: 1,
              audio_files_uploaded: 1,
            },
            sessionId
          ),
        'end session after audio upload'
      );

      store.setSessionV2Content(sessionId, { phase: SESSION_PHASE.PROCESSING });

      // Processing has started — let the dialog close immediately and poll in the
      // background. The session tabs and footer reflect the polling/result state.
      pollSessionInBackground(sessionId);

      return true;
    } catch (error) {
      console.error('processAudio error:', error);
      tracker.error(error, {
        domain: 'recording',
        component: 'upload_audio',
        extra: { session_id: store.sessionV2Ongoing.recording_session_id },
      });
      store.setWarningInfo({
        screen: 'upload_audio',
        message: 'Failed to process audio. Please try again.',
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, audioFile, createSession]);

  return {
    audioFile,
    setAudioFile,
    isLoading,
    processAudio,
  };
}
