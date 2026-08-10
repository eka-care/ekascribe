'use client';

import { useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import useVoice2RxStore from '@/store/store';
import { with401Retry } from '@/fetch-client/api-with-retry';
import * as sdkService from '../services/sdk-service';
import { pollAndLoadSessionDetails } from '../services/session-loader';
import { SESSION_PHASE } from '@/constants/enums';
import { tracker } from '@/analytics';
import { discardAndCleanup } from '../utils/discard-session';

function isSessionCleared(sessionId: string): boolean {
  return !useVoice2RxStore.getState().sessionV2ContentById[sessionId];
}

function isActiveRecording(sessionId: string): boolean {
  return useVoice2RxStore.getState().sessionV2Ongoing.recording_session_id === sessionId;
}

function setSessionError(sessionId: string, code: string, message: string, failedFiles?: string[]) {
  useVoice2RxStore.getState().setSessionV2Content(sessionId, {
    phase: SESSION_PHASE.ERROR,
    error: { code, message, ...(failedFiles ? { failed_files: failedFiles } : {}) },
  });
}

// Retry failed chunk uploads, then finalize session
async function retryFailedUploads(sessionId: string): Promise<boolean> {
  const retryResponse = await with401Retry(
    () => sdkService.retryUploadRecording(),
    'retry upload recording'
  );

  if (retryResponse.error_code || retryResponse.status_code >= 400) {
    setSessionError(
      sessionId,
      retryResponse.error_code || 'retry_failed',
      retryResponse.message || 'Retry failed.'
    );
    return false;
  }

  if (retryResponse.failed_files && retryResponse.failed_files.length > 0) {
    setSessionError(
      sessionId,
      'upload_failed',
      'Some audio chunks still failed to upload.',
      retryResponse.failed_files
    );
    return false;
  }

  if (isSessionCleared(sessionId)) return false;

  // All uploads succeeded — finalize the session
  return endSessionCall(sessionId);
}

// Call endSession API to finalize recording
async function endSessionCall(sessionId: string): Promise<boolean> {
  const totalChunks =
    useVoice2RxStore.getState().sessionV2ContentById[sessionId]?.uploaded_chunks?.length || 0;

  const endResult = await with401Retry(
    () =>
      sdkService.endSession(
        { audio_files_sent: totalChunks, audio_files_uploaded: totalChunks },
        sessionId
      ),
    'end session'
  );

  if (isSessionCleared(sessionId)) return false;

  if (!endResult.success) {
    setSessionError(
      sessionId,
      endResult.error?.code || 'end_session_failed',
      endResult.error?.message || 'Failed to end session.'
    );
    return false;
  }

  return true;
}

// Poll backend for processed output
async function pollForOutput(sessionId: string): Promise<void> {
  const result = await pollAndLoadSessionDetails(sessionId, SESSION_PHASE.OUTPUT, {
    transcriptFirst: true,
  });

  if (isSessionCleared(sessionId)) return;

  if (result === 'failed') {
    setSessionError(sessionId, 'processing_failed', 'Failed to process data. Please try again.');
  }
}

export function useErrorHandlers(sessionId: string) {
  const router = useRouter();
  const retryInFlightRef = useRef(false);

  const handleTryAgain = useCallback(async () => {
    if (retryInFlightRef.current) return;
    if (!sessionId) return;

    const store = useVoice2RxStore.getState();
    retryInFlightRef.current = true;

    const sessionContent = store.sessionV2ContentById[sessionId];
    const error = sessionContent?.error;
    const totalChunks = sessionContent?.uploaded_chunks?.length ?? 0;

    tracker.log({
      name: 'retry_attempted',
      properties: {
        session_id: sessionId,
        error_code: error?.code,
        failed_files_count: error?.failed_files?.length ?? 0,
        total_chunks: totalChunks,
        network_online: navigator.onLine,
      },
    });

    store.setSessionV2Content(sessionId, { phase: SESSION_PHASE.PROCESSING, error: null });

    try {
      const isLive = isActiveRecording(sessionId);

      if (isLive && error?.code === 'upload_failed') {
        // Upload failure on active recording — retry chunks then finalize
        const ok = await retryFailedUploads(sessionId);
        if (!ok) return;
      } else if (isLive && error?.code !== 'processing_failed') {
        // Other error on active recording — end session first
        const ok = await endSessionCall(sessionId);
        if (!ok) return;
      }
      // Past session or processing_failed with committed status — just re-poll

      await pollForOutput(sessionId);
    } catch (err) {
      if (isSessionCleared(sessionId)) return;

      tracker.error(err, {
        domain: 'recording',
        component: 'retry_upload',
        extra: {
          session_id: sessionId,
          error_code: error?.code,
          total_chunks: totalChunks,
          network_online: navigator.onLine,
        },
      });

      setSessionError(
        sessionId,
        'internal_server_error',
        'Failed to retry. Please try again.',
        error?.failed_files
      );
    } finally {
      retryInFlightRef.current = false;
    }
  }, [sessionId]);

  const handleDiscard = useCallback(() => {
    if (!sessionId) return;
    discardAndCleanup(sessionId, () => router.replace('/new-session'), 'error_screen');
  }, [sessionId, router]);

  const handleContinueRecording = useCallback(() => {
    if (!sessionId) return;

    try {
      sdkService.forceAllowMoreChunks();
    } catch {}

    useVoice2RxStore.getState().setSessionV2Content(sessionId, {
      phase: SESSION_PHASE.RECORDING,
      error: null,
    });
  }, [sessionId]);

  return { handleTryAgain, handleDiscard, handleContinueRecording };
}
