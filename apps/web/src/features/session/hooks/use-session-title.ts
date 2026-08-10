'use client';

import { useCallback } from 'react';
import useVoice2RxStore from '@/store/store';
import { with401Retry } from '@/fetch-client/api-with-retry';
import { getSDK } from '@/features/session/services/sdk-provider';
import { tracker } from '@/analytics';

/**
 * Session title lives in the session's `additional_data.title`. The backend
 * PATCH replaces additional_data wholesale, so we always send the merged object.
 */
export const useSessionTitle = (sessionId: string) => {
  const title = useVoice2RxStore(
    (s) => (s.sessionV2ContentById[sessionId]?.additional_data?.title as string | undefined) ?? ''
  );

  const saveTitle = useCallback(
    async (nextTitle: string) => {
      const store = useVoice2RxStore.getState();
      const current = store.sessionV2ContentById[sessionId]?.additional_data ?? {};
      const trimmed = nextTitle.trim();

      const next = { ...current };
      if (trimmed) {
        next.title = trimmed;
      } else {
        delete next.title;
      }

      // Optimistic update; revert on API failure
      store.setSessionV2Content(sessionId, { additional_data: next });

      try {
        const response = await with401Retry(
          () => getSDK().sessions.patchSessionStatus({ additional_data: next }, sessionId),
          'patch session title'
        );
        if (!response.success) {
          useVoice2RxStore.getState().setSessionV2Content(sessionId, { additional_data: current });
          useVoice2RxStore.getState().setWarningInfo({
            message: 'Failed to save title. Please try again.',
            type: 'error',
            screen: 'start_session',
          });
        }
      } catch (err) {
        useVoice2RxStore.getState().setSessionV2Content(sessionId, { additional_data: current });
        tracker.error(err, {
          domain: 'api',
          component: 'voice_api',
          extra: { action: 'save_session_title', session_id: sessionId },
        });
        useVoice2RxStore.getState().setWarningInfo({
          message: 'Failed to save title. Please try again.',
          type: 'error',
          screen: 'start_session',
        });
      }
    },
    [sessionId]
  );

  const removeTitle = useCallback(() => saveTitle(''), [saveTitle]);

  return { title, saveTitle, removeTitle };
};
