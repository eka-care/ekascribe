'use client';

import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { TPatchVoiceApiV2ConfigRequest } from '@eka-care/ekascribe-ts-sdk';
import useVoice2RxStore from '@/store/store';
import { with401Retry } from '@/fetch-client/api-with-retry';
import { getEkascribeConfigQueryKey } from '@/features/settings/hooks/use-get-config';
import * as sdkService from '../services/sdk-service';

export type SavedNote = {
  document_id: string;
  document_name: string;
};

export function useSavedNotes() {
  const appConfig = useVoice2RxStore((state) => state.appConfig);
  const setAppConfig = useVoice2RxStore((state) => state.setAppConfig);
  const savedNotesIds = appConfig.notes_ids ?? [];
  const queryClient = useQueryClient();

  const notes = useMemo<SavedNote[]>(
    () => savedNotesIds.map(({ id, name }) => ({ document_id: id, document_name: name })),
    [savedNotesIds]
  );

  const isNoteSaved = useCallback(
    (documentId: string) => savedNotesIds.some((note) => note.id === documentId),
    [savedNotesIds]
  );

  const saveNote = useCallback(
    async (documentId: string, documentName: string): Promise<boolean> => {
      if (savedNotesIds.some((note) => note.id === documentId)) return true;

      const updatedIds = [...savedNotesIds, { id: documentId, name: documentName }];
      const previous = appConfig;
      setAppConfig({ ...appConfig, notes_ids: updatedIds });

      const res = await with401Retry(
        () =>
          sdkService.updateConfig({
            request_type: 'user',
            data: { notes_ids: updatedIds },
          } as unknown as TPatchVoiceApiV2ConfigRequest),
        'update config - save note'
      );

      if (res.status_code >= 200 && res.status_code < 300) {
        await queryClient.invalidateQueries({ queryKey: getEkascribeConfigQueryKey() });
        return true;
      }

      setAppConfig(previous);
      return false;
    },
    [appConfig, savedNotesIds, setAppConfig, queryClient]
  );

  return { notes, isNoteSaved, saveNote };
}
