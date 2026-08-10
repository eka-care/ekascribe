'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { AudioEvent, UploadEvent } from 'med-scribe-alliance-ts-sdk';
import useVoice2RxStore from '@/store/store';
import { tracker } from '@/analytics';
import { getSDK } from '../../services/sdk-provider';
import * as sdkService from '../../services/sdk-service';
import { getAudioAmplitude, mapAmplitudeForUi } from '../../utils/calculate-amplitude';
import { getBlobStore } from '@/platform';
import { SESSION_PHASE } from '@/constants/enums';

export function useRecordingCallbacks() {
  const callbacksRef = useRef<{
    audio: (e: AudioEvent) => void;
    upload: (e: UploadEvent) => void;
  } | null>(null);
  const noAudioRef = useRef({ frameCount: 0, startTime: 0 });

  const register = useCallback(() => {
    noAudioRef.current = { frameCount: 0, startTime: 0 };

    const sdk = getSDK();

    const handleAudioEvent = (event: AudioEvent) => {
      const store = useVoice2RxStore.getState();
      const sessionId = store.sessionV2Ongoing.recording_session_id;
      if (!sessionId) return;

      switch (event.type) {
        case 'frame_processed': {
          const raw = getAudioAmplitude(event.data.frame);
          const amplitude = mapAmplitudeForUi(raw);
          const content = store.sessionV2ContentById[sessionId];
          if (content) {
            // event.data.duration is per-frame duration (frame.length / sampleRate),
            // not elapsed time — accumulate it
            store.setSessionV2Content(sessionId, {
              session_duration: content.session_duration + event.data.duration,
              audio_amplitudes: [...content.audio_amplitudes.slice(-299), amplitude],
            });
          }
          break;
        }

        case 'user_speech':
          store.setSessionV2Content(sessionId, { is_speaking: event.data.isSpeaking });
          if (event.data.isSpeaking) {
            noAudioRef.current = { frameCount: 0, startTime: 0 };
            if (useVoice2RxStore.getState().warningScreen === 'recording') {
              store.clearWarningInfo();
            }
          }
          break;

        case 'silence_warning': {
          const currentTime = Date.now();
          noAudioRef.current.frameCount += 1;
          if (noAudioRef.current.frameCount === 1) {
            noAudioRef.current.startTime = currentTime;
          }

          const timeElapsed = noAudioRef.current.startTime
            ? currentTime - noAudioRef.current.startTime
            : 0;
          const shouldPause = noAudioRef.current.frameCount >= 30 || timeElapsed >= 5 * 60 * 1000;

          if (shouldPause) {
            store.clearWarningInfo();
            noAudioRef.current = { frameCount: 0, startTime: 0 };
            store.setSessionV2Content(sessionId, { phase: SESSION_PHASE.PAUSED });
            try {
              sdkService.pauseRecording();
            } catch {
              // Auto-pause best-effort; SDK may already be paused
            }
          } else {
            store.setWarningInfo({
              screen: 'recording',
              message: "Your voice isn't audible. Please speak a little louder.",
            });
          }
          break;
        }

        case 'chunk_ready': {
          const content = store.sessionV2ContentById[sessionId];
          if (content) {
            store.setSessionV2Content(sessionId, {
              uploaded_chunks: [...content.uploaded_chunks, event.data.fileName],
            });
          }

          // TODO: remove this log later
          tracker.log({
            name: 'chunk_ready',
            properties: { fileName: event.data.fileName, session_id: sessionId },
          });
          // Save audio chunk to IndexedDB for offline recovery / audio download
          (async () => {
            try {
              const chunkBlob = new Blob(
                event.data.chunkData.map(
                  (arr: Int8Array | ArrayBuffer | Uint8Array) =>
                    new Uint8Array('buffer' in arr ? (arr.buffer as ArrayBuffer) : arr)
                ) as BlobPart[]
              );
              await getBlobStore().put(sessionId, event.data.fileName, chunkBlob);
            } catch {
              // best-effort — don't block recording
            }
          })();
          break;
        }
      }
    };

    const handleUploadEvent = (event: UploadEvent) => {
      const store = useVoice2RxStore.getState();
      const sessionId = store.sessionV2Ongoing.recording_session_id;
      if (!sessionId) return;

      switch (event.type) {
        case 'progress':
          store.setSessionV2Content(sessionId, {
            upload_progress: {
              success: event.data.successCount,
              total: event.data.totalCount,
            },
          });
          break;

        case 'failed':
          console.error('Upload failed:', event.data.fileName, event.data.error);
          tracker.log({
            name: 'chunk_upload_failed',
            properties: {
              fileName: event.data.fileName,
              session_id: sessionId,
              network_online: navigator.onLine,
              error_message: String(event.data.error ?? ''),
            },
          });
          break;
        case 'retry':
          console.warn('Upload retry:', event.data.fileName, 'attempt:', event.data.attempt);
          // TODO: remove this log later
          tracker.log({
            name: 'chunk_upload_retry',
            properties: {
              fileName: event.data.fileName,
              session_id: sessionId,
              attempt: event.data.attempt,
            },
          });
          break;
      }
    };

    sdk.registerCallback('onAudioEvent', handleAudioEvent);
    sdk.registerCallback('onUploadEvent', handleUploadEvent);
    callbacksRef.current = { audio: handleAudioEvent, upload: handleUploadEvent };
  }, []);

  const unregister = useCallback(() => {
    if (!callbacksRef.current) return;
    const sdk = getSDK();
    sdk.removeCallback('onAudioEvent', callbacksRef.current.audio);
    sdk.removeCallback('onUploadEvent', callbacksRef.current.upload);
    callbacksRef.current = null;
  }, []);

  // Cleanup on unmount
  useEffect(() => () => unregister(), [unregister]);

  return { register, unregister };
}
