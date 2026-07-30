'use client';

import { useCallback } from 'react';
import useVoice2RxStore from '@/store/store';
import { with401Retry } from '@/fetch-client/api-with-retry';
import * as sdkService from '../services/sdk-service';
import { pollAndLoadSessionDetails } from '../services/session-loader';

export function useConvertTemplate(sessionId: string) {
  const convertTemplate = useCallback(
    async (template: { id: string; name: string }): Promise<string | null> => {
      try {
        // Get existing document IDs before conversion so we can find the new one
        const existingDocIds = new Set(
          (useVoice2RxStore.getState().sessionV2ContentById[sessionId]?.documents || []).map(
            (d) => d.document_id
          )
        );

        const result = await with401Retry(
          () =>
            sdkService.convertToTemplate({
              txn_id: sessionId,
              template_id: template.id,
            }),
          'convert to template'
        );

        if (!result.success) {
          useVoice2RxStore.getState().setWarningInfo({
            screen: 'template',
            message: 'Failed to generate template. Please try again.',
          });
          return null;
        }

        // Wait for backend to finish generating, then reload session details
        const pollResult = await pollAndLoadSessionDetails(sessionId);

        if (pollResult === 'failed') {
          useVoice2RxStore.getState().setWarningInfo({
            screen: 'template',
            message: 'Template generation is taking longer than expected. Please try again.',
          });
          return null;
        }

        // Find the new document that wasn't there before
        const documents =
          useVoice2RxStore.getState().sessionV2ContentById[sessionId]?.documents || [];
        const newDoc = documents.find((d) => !existingDocIds.has(d.document_id));

        if (newDoc) {
          return newDoc.document_id;
        }

        return null;
      } catch (error) {
        console.error('convertTemplate error:', error);
        useVoice2RxStore.getState().setWarningInfo({
          screen: 'template',
          message: 'Failed to generate template. Please try again.',
        });
        return null;
      }
    },
    [sessionId]
  );

  return { convertTemplate };
}
