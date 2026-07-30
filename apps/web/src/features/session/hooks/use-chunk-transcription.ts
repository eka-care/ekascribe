'use client';

import { useEffect, useRef } from 'react';
import useVoice2RxStore from '@/store/store';
import { with401Retry } from '@/fetch-client/api-with-retry';
import * as sdkService from '../services/sdk-service';
import { SESSION_PHASE } from '@/constants/enums';

const POLL_INTERVAL_MS = 1500;
const MAX_POLL_ATTEMPTS = 5;
const EMPTY_CHUNKS: string[] = [];

export function useChunkTranscription({
  sessionId,
  enabled = true,
}: {
  sessionId: string;
  enabled?: boolean;
}) {
  const phase = useVoice2RxStore((s) => s.sessionV2ContentById[sessionId]?.phase);
  const uploadedChunks = useVoice2RxStore(
    (s) => s.sessionV2ContentById[sessionId]?.uploaded_chunks ?? EMPTY_CHUNKS
  );

  const pollingSetRef = useRef<Set<string>>(new Set());
  const intervalsRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  const isRecordingActive = phase === SESSION_PHASE.RECORDING || phase === SESSION_PHASE.PAUSED;

  // Reset polling state when session changes
  useEffect(() => {
    pollingSetRef.current.clear();
  }, [sessionId]);

  // Clear all active intervals when recording stops
  useEffect(() => {
    if (!isRecordingActive) {
      for (const intervalId of intervalsRef.current.values()) {
        clearInterval(intervalId);
      }
      intervalsRef.current.clear();
    }
  }, [isRecordingActive]);

  // Start polling as soon as chunks appear
  useEffect(() => {
    if (!enabled || !sessionId || uploadedChunks.length === 0) return;

    const existingTranscripts =
      useVoice2RxStore.getState().sessionV2ContentById[sessionId]?.chunk_transcripts || {};

    for (const chunkFileName of uploadedChunks) {
      // Skip chunks that already have transcripts or are already being polled
      if (existingTranscripts[chunkFileName] || pollingSetRef.current.has(chunkFileName)) continue;
      pollingSetRef.current.add(chunkFileName);

      let attempts = 0;
      const chunkNumber = chunkFileName.replace(/\.[^.]+$/, '').replace(/^audio_/, '');

      const poll = async () => {
        attempts++;
        try {
          const result = await with401Retry(
            () => sdkService.getChunkTranscript(sessionId, chunkNumber),
            'get chunk transcript'
          );

          if (result.success) {
            useVoice2RxStore.getState().setSessionV2Content(sessionId, (prev) => ({
              ...prev,
              chunk_transcripts: {
                ...prev.chunk_transcripts,
                [chunkFileName]: result.data.text,
              },
            }));
            const intervalId = intervalsRef.current.get(chunkFileName);
            if (intervalId) {
              clearInterval(intervalId);
              intervalsRef.current.delete(chunkFileName);
            }
            return;
          }
        } catch {
          // Network error — will retry on next interval
        }

        if (attempts >= MAX_POLL_ATTEMPTS) {
          const intervalId = intervalsRef.current.get(chunkFileName);
          if (intervalId) {
            clearInterval(intervalId);
            intervalsRef.current.delete(chunkFileName);
          }
        }
      };

      poll();
      const intervalId = setInterval(poll, POLL_INTERVAL_MS);
      intervalsRef.current.set(chunkFileName, intervalId);
    }
  }, [enabled, uploadedChunks, sessionId]);

  // Cleanup on unmount — intervals restart on remount for chunks still missing transcripts
  useEffect(() => {
    return () => {
      for (const intervalId of intervalsRef.current.values()) {
        clearInterval(intervalId);
      }
      intervalsRef.current.clear();
      pollingSetRef.current.clear();
    };
  }, []);
}
