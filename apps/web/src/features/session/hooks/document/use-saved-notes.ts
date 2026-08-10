'use client';

import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { TPatchVoiceApiV2ConfigRequest } from '@eka-care/ekascribe-ts-sdk';
import useVoice2RxStore from '@/store/store';
import { with401Retry } from '@/fetch-client/api-with-retry';
import { getEkascribeConfigQueryKey } from '@/features/settings/hooks/use-get-config';
import * as sdkService from '../../services/sdk-service';

export type SavedNote = {
  document_id: string;
  document_name: string;
  /** ISO date the note was added to favourites. Absent on notes saved before this was tracked. */
  added_at?: string;
};

export function useSavedNotes() {
  const appConfig = useVoice2RxStore((state) => state.appConfig);
  const setAppConfig = useVoice2RxStore((state) => state.setAppConfig);
  const savedNotesIds = appConfig.notes_ids ?? [];
  const queryClient = useQueryClient();

  const notes = useMemo<SavedNote[]>(
    () =>
      savedNotesIds.map(({ id, name, added_at }) => ({
        document_id: id,
        document_name: name,
        added_at,
      })),
    [savedNotesIds]
  );

  const isNoteSaved = useCallback(
    (documentId: string) => savedNotesIds.some((note) => note.id === documentId),
    [savedNotesIds]
  );

  const updateNotesIds = useCallback(
    async (updatedIds: typeof savedNotesIds, logContext: string): Promise<boolean> => {
      const previous = appConfig;
      setAppConfig({ ...appConfig, notes_ids: updatedIds });

      const res = await with401Retry(
        () =>
          sdkService.updateConfig({
            request_type: 'user',
            data: { notes_ids: updatedIds },
          } as unknown as TPatchVoiceApiV2ConfigRequest),
        logContext
      );

      if (res.status_code >= 200 && res.status_code < 300) {
        await queryClient.invalidateQueries({ queryKey: getEkascribeConfigQueryKey() });
        return true;
      }

      setAppConfig(previous);
      return false;
    },
    [appConfig, setAppConfig, queryClient]
  );

  const saveNote = useCallback(
    async (documentId: string, documentName: string): Promise<boolean> => {
      if (savedNotesIds.some((note) => note.id === documentId)) return true;

      const updatedIds = [
        ...savedNotesIds,
        { id: documentId, name: documentName, added_at: new Date().toISOString() },
      ];
      return updateNotesIds(updatedIds, 'update config - save note');
    },
    [savedNotesIds, updateNotesIds]
  );

  const removeNote = useCallback(
    async (documentId: string): Promise<boolean> => {
      if (!savedNotesIds.some((note) => note.id === documentId)) return true;

      const updatedIds = savedNotesIds.filter((note) => note.id !== documentId);
      return updateNotesIds(updatedIds, 'update config - remove note');
    },
    [savedNotesIds, updateNotesIds]
  );

  return { notes, isNoteSaved, saveNote, removeNote };
}
