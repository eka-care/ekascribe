'use client';

import { useCallback } from 'react';
import useVoice2RxStore from '@/store/store';
import { SESSION_PHASE } from '@/constants/enums';

export type FooterMode =
  'none' | 'error' | 'chunk-limit' | 'context' | 'transcript' | 'document' | 'doc-error' | 'stream';

export function useSessionView(sessionId: string) {
  const phase = useVoice2RxStore(
    (s) => s.sessionV2ContentById[sessionId]?.phase || SESSION_PHASE.IDLE
  );
  const error = useVoice2RxStore((s) => s.sessionV2ContentById[sessionId]?.error ?? null);
  const errorCode = error?.code ?? null;
  const uiLoading = useVoice2RxStore(
    (s) => s.sessionV2ContentById[sessionId]?.ui?.loading || false
  );
  const isLimitExceeded = useVoice2RxStore(
    (s) => !!s.sessionV2ContentById[sessionId]?.is_limit_exceeded
  );
  // Header
  const canStartRecording = phase === SESSION_PHASE.IDLE && !uiLoading;
  const showEditPreferences = phase === SESSION_PHASE.IDLE && !uiLoading;
  const showMicSelector = phase === SESSION_PHASE.IDLE && !uiLoading;

  // Tabs
  const showAddButton = phase !== SESSION_PHASE.PROCESSING && phase !== SESSION_PHASE.ERROR;
  const userStatus = useVoice2RxStore((s) => s.sessionV2ContentById[sessionId]?.user_status || '');
  const showConvertOption = userStatus === 'commit';
  const showGenerateTranscript = phase === SESSION_PHASE.IDLE;

  // Footer — takes active tab + doc status, returns which footer variant to render.
  const getFooterMode = useCallback(
    (activeTab: string, activeDocStatus?: string): FooterMode => {
      const isContext = activeTab === 'context';
      const isRecords = activeTab === 'records';
      const isStream = activeTab.startsWith('stream:');
      const isTranscript = activeTab === 'transcript';

      // Session-level errors override tab footer (except context/records)
      if (phase === SESSION_PHASE.ERROR && !isContext && !isRecords) {
        return errorCode === 'chunk_limit_reached' ? 'chunk-limit' : 'error';
      }

      if (isContext) return 'context';
      if (isRecords) return 'none';
      if (isStream) return 'stream';
      if (!activeDocStatus) return 'none';
      if (activeDocStatus === 'failure') return 'doc-error';

      return isTranscript ? 'transcript' : 'document';
    },
    [phase, errorCode]
  );

  return {
    phase,
    error,
    uiLoading,
    isLimitExceeded,

    canStartRecording,
    showEditPreferences,
    showMicSelector,
    showAddButton,
    showConvertOption,
    showGenerateTranscript,

    getFooterMode,
  };
}
