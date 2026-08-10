'use client';

import { useCallback } from 'react';
import useVoice2RxStore from '@/store/store';
import { with401Retry } from '@/fetch-client/api-with-retry';
import { getSDK } from '@/features/session/services/sdk-provider';
import { tracker } from '@/analytics';

/**
 * Session title lives in the session's `session_details.title` (session meta).
 * The backend PATCH replaces session_details wholesale, so we always send the
 * merged object.
 */
export const useSessionTitle = (sessionId: string) => {
  const title = useVoice2RxStore(
    (s) => (s.sessionV2ContentById[sessionId]?.session_details?.title as string | undefined) ?? ''
  );

  const saveTitle = useCallback(
    async (nextTitle: string) => {
      const store = useVoice2RxStore.getState();
      const current = store.sessionV2ContentById[sessionId]?.session_details ?? {};
      const trimmed = nextTitle.trim();

      const next = { ...current };
      if (trimmed) {
        next.title = trimmed;
      } else {
        delete next.title;
      }

      // Optimistic update; revert on API failure
      store.setSessionV2Content(sessionId, { session_details: next });

      try {
        const response = await with401Retry(
          () =>
            getSDK().sessions.patchSessionStatus(
              { session_details: next } as unknown as Parameters<
                ReturnType<typeof getSDK>['sessions']['patchSessionStatus']
              >[0],
              sessionId
            ),
          'patch session title'
        );
        if (!response.success) {
          useVoice2RxStore.getState().setSessionV2Content(sessionId, { session_details: current });
          useVoice2RxStore.getState().setWarningInfo({
            message: 'Failed to save title. Please try again.',
            type: 'error',
            screen: 'start_session',
          });
        }
      } catch (err) {
        useVoice2RxStore.getState().setSessionV2Content(sessionId, { session_details: current });
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
