'use client';

import { useCallback } from 'react';
import useVoice2RxStore from '@/store/store';
import type { NormalizedDocument } from '../../types';
import {
  addNote,
  fetchDocumentContent,
  fetchDocumentJson,
  saveDocumentContent,
  saveDocumentJson,
} from '../../services/document-service';

export function useCopyFromSession({ sessionId }: { sessionId: string }) {
  const copyNoteIntoSession = useCallback(
    async (
      sourceSessionId: string,
      note: Pick<NormalizedDocument, 'document_id' | 'document_name' | 'get_url'>
    ): Promise<string | null> => {
      try {
        const [content, { tiptapJson }] = await Promise.all([
          fetchDocumentContent(sourceSessionId, note.document_id, note.get_url),
          fetchDocumentJson(sourceSessionId, note.document_id),
        ]);

        const newDoc = await addNote(sessionId, note.document_name || 'Note', 'notes', {
          skipStoreUpdate: true,
        });
        if (!newDoc) throw new Error('Failed to create note');

        await Promise.all([
          content
            ? saveDocumentContent(sessionId, newDoc.document_id, content, null)
            : Promise.resolve(true),
          tiptapJson
            ? saveDocumentJson(sessionId, newDoc.document_id, tiptapJson as Record<string, unknown>)
            : Promise.resolve(true),
        ]);

        useVoice2RxStore
          .getState()
          .addSessionV2Document(sessionId, { ...newDoc, content: content ?? null });

        return newDoc.document_id;
      } catch (error) {
        console.error('copyNoteIntoSession error:', error);
        useVoice2RxStore.getState().setWarningInfo({
          screen: 'template',
          message: 'Failed to copy note. Please try again.',
        });
        return null;
      }
    },
    [sessionId]
  );

  return { copyNoteIntoSession };
}
