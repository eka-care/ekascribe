'use client';

import { useCallback, useState } from 'react';
import useVoice2RxStore from '@/store/store';
import { with401Retry } from '@/fetch-client/api-with-retry';
import * as sdkService from '../../services/sdk-service';
import { pollSessionInBackground } from '../../services/session-loader';
import { SESSION_PHASE } from '@/constants/enums';
import { tracker } from '@/analytics';

export function useProcessTranscript(sessionId: string) {
  const [transcriptionText, setTranscriptionText] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const processTranscript = useCallback(async (): Promise<boolean> => {
    if (isLoading || !transcriptionText.trim() || !sessionId) return false;

    setIsLoading(true);
    const store = useVoice2RxStore.getState();

    // Use this session's own config; fall back to the user's defaults when the session config
    // has no template yet (request_templates is empty until a session is processed).
    // const sessionTemplates =
    //   store.sessionV2ContentById[sessionId]?.session_config?.output_format_template;
    // const outputTemplates = (
    //   sessionTemplates?.length ? sessionTemplates : store.userLevelPreferences.output_format_template
    // ).map((t) => t.id);

    tracker.log({
      name: 'upload_transcript_to_notes',
      properties: { session_id: sessionId },
    });

    try {
      const response = await with401Retry(
        () =>
          sdkService.convertTranscriptionToTemplate({
            txn_id: sessionId,
            transcript: transcriptionText,
          }),
        'convert transcription to template'
      );

      if (response.status_code >= 400 || response.status === 'failed') {
        store.setWarningInfo({
          screen: 'upload_transcription',
          message: response.error?.message || 'Failed to convert transcription.',
        });
        setIsLoading(false);
        return false;
      }

      store.setSessionV2Content(sessionId, { phase: SESSION_PHASE.PROCESSING });

      // Processing has started — let the dialog close immediately and poll in the
      // background. The session tabs and footer reflect the polling/result state.
      pollSessionInBackground(sessionId);

      return true;
    } catch (error) {
      console.error('processTranscript error:', error);
      tracker.error(error, {
        domain: 'processing',
        component: 'upload_transcript',
        extra: { session_id: sessionId, network_online: navigator.onLine },
      });
      store.setWarningInfo({
        screen: 'upload_transcription',
        message: 'Failed to process transcription. Please try again.',
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, transcriptionText, sessionId]);

  return {
    transcriptionText,
    setTranscriptionText,
    isLoading,
    processTranscript,
  };
}
