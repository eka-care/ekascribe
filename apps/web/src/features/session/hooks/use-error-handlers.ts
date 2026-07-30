'use client';

import { useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import useVoice2RxStore from '@/store/store';
import { with401Retry } from '@/fetch-client/api-with-retry';
import * as sdkService from '../services/sdk-service';
import { pollAndLoadSessionDetails } from '../services/session-loader';
import { SESSION_PHASE } from '@/constants/enums';
import { tracker } from '@/analytics';

export function useErrorHandlers() {
  const router = useRouter();
  const retryInFlightRef = useRef(false);

  const handleTryAgain = useCallback(async () => {
    if (retryInFlightRef.current) return;

    const store = useVoice2RxStore.getState();
    const sessionId = store.sessionV2Ongoing.recording_session_id;
    if (!sessionId) return;

    retryInFlightRef.current = true;

    const error = store.sessionV2ContentById[sessionId]?.error;
    tracker.log({
      name: 'retry_attempted',
      properties: { session_id: sessionId, error_code: error?.code },
    });
    store.setSessionV2Content(sessionId, { phase: SESSION_PHASE.PROCESSING, error: null });

    try {
      if (error?.failed_files?.length) {
        // Upload failure — retry the failed chunks
        const retryResponse = await with401Retry(
          () => sdkService.retryUploadRecording(),
          'retry upload recording'
        );

        if (retryResponse.error_code) {
          store.setSessionV2Content(sessionId, {
            phase: SESSION_PHASE.ERROR,
            error: {
              code: retryResponse.error_code,
              message: retryResponse.message || 'Retry failed.',
            },
          });
          return;
        }

        if (retryResponse.failed_files && retryResponse.failed_files.length > 0) {
          store.setSessionV2Content(sessionId, {
            phase: SESSION_PHASE.ERROR,
            error: {
              code: 'upload_failed',
              message: 'Some audio chunks still failed to upload.',
              failed_files: retryResponse.failed_files,
            },
          });
          return;
        }

        // Bail out if session was cleared by stopProcessing during retry
        if (useVoice2RxStore.getState().sessionV2Ongoing.recording_session_id !== sessionId) return;

        // All uploads succeeded — finalize the session
        const totalChunks = store.sessionV2ContentById[sessionId]?.uploaded_chunks?.length || 0;
        await with401Retry(
          () =>
            sdkService.endSession(
              { audio_files_sent: totalChunks, audio_files_uploaded: totalChunks },
              sessionId
            ),
          'end session'
        );

        // Bail out if session was cleared by stopProcessing during endSession
        if (useVoice2RxStore.getState().sessionV2Ongoing.recording_session_id !== sessionId) return;
      } else if (error?.code !== 'processing_failed') {
        // Non-upload, non-processing error — try ending the session directly
        const totalChunks = store.sessionV2ContentById[sessionId]?.uploaded_chunks?.length || 0;
        await with401Retry(
          () =>
            sdkService.endSession(
              { audio_files_sent: totalChunks, audio_files_uploaded: totalChunks },
              sessionId
            ),
          'end session'
        );

        // Bail out if session was cleared by stopProcessing during endSession
        if (useVoice2RxStore.getState().sessionV2Ongoing.recording_session_id !== sessionId) return;
      }
      // For processing_failed: session already ended, just poll again

      // Session ended — poll for output
      const result = await pollAndLoadSessionDetails(sessionId, SESSION_PHASE.OUTPUT, {
        transcriptFirst: true,
      });

      // If session was cleared by stopProcessing while polling, bail out
      if (useVoice2RxStore.getState().sessionV2Ongoing.recording_session_id !== sessionId) return;

      if (result === 'failed') {
        store.setSessionV2Content(sessionId, {
          phase: SESSION_PHASE.ERROR,
          error: {
            code: 'processing_failed',
            message: 'Failed to process data. Please try again.',
          },
        });
      }
    } catch (err) {
      // If session was cleared by stopProcessing, bail out
      if (useVoice2RxStore.getState().sessionV2Ongoing.recording_session_id !== sessionId) return;

      tracker.error(err, {
        domain: 'recording',
        component: 'retry_upload',
        extra: { session_id: sessionId, error_code: error?.code },
      });
      store.setSessionV2Content(sessionId, {
        phase: SESSION_PHASE.ERROR,
        error: {
          code: 'internal_server_error',
          message: 'Failed to retry. Please try again.',
          failed_files: error?.failed_files,
        },
      });
    } finally {
      retryInFlightRef.current = false;
    }
  }, []);

  const handleDiscard = useCallback(() => {
    const store = useVoice2RxStore.getState();
    const sessionId = store.sessionV2Ongoing.recording_session_id;

    if (sessionId) {
      tracker.log({
        name: 'discard_session',
        properties: { session_id: sessionId, source: 'error_screen' },
      });
      with401Retry(() => sdkService.cancelSession(sessionId), 'cancel session');
      store.clearSessionV2Content(sessionId);
    }

    store.clearRecordingSessionId();
    store.clearStore();
    store.refreshPastSessionsCallback?.();
    store.setWarningInfo({
      message: 'Session was discarded',
      type: 'success',
      screen: 'start_session',
    });
    router.replace('/new-session');
  }, [router]);

  const handleContinueRecording = useCallback(() => {
    const store = useVoice2RxStore.getState();
    const sessionId = store.sessionV2Ongoing.recording_session_id;
    if (!sessionId) return;

    try {
      sdkService.forceAllowMoreChunks();
    } catch {}

    store.setSessionV2Content(sessionId, {
      phase: SESSION_PHASE.RECORDING,
      error: null,
    });
  }, []);

  return { handleTryAgain, handleDiscard, handleContinueRecording };
}
