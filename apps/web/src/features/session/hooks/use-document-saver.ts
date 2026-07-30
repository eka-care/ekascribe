'use client';

import { useCallback, useRef } from 'react';
import type { JSONContent } from '@tiptap/core';

import { saveDocumentJson, saveDocumentContent } from '../services/document-service';
import useVoice2RxStore from '@/store/store';

type SaverArgs = {
  sessionId: string;
  documentId: string;
  streamKey?: string;
};

export type SavePayload = {
  json?: JSONContent;
  markdown: string;
};

export type DocumentSaver = {
  save: (payload: SavePayload) => Promise<boolean>;
};

export function useDocumentSaver({ sessionId, documentId, streamKey }: SaverArgs): DocumentSaver {
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  const docIdRef = useRef(documentId);
  docIdRef.current = documentId;

  const statusKeyRef = useRef(streamKey ?? documentId);
  statusKeyRef.current = streamKey ?? documentId;

  const save = useCallback(async ({ json, markdown }: SavePayload): Promise<boolean> => {
    const sid = sessionIdRef.current;
    const did = docIdRef.current;
    const statusKey = statusKeyRef.current;

    if (!did) return false;

    console.log('[document.save]', statusKey, {
      json,
      markdown,
      json_size_bytes: json ? JSON.stringify(json).length : 0,
      markdown_size_bytes: markdown.length,
    });

    try {
      useVoice2RxStore.getState().setSessionV2Document(sid, did, { content: markdown });

      const editUrl =
        useVoice2RxStore.getState().sessionV2ContentById[sid]?.documents.find(
          (d) => d.document_id === did
        )?.edit_url ?? null;

      const [jsonOk, mdOk] = await Promise.all([
        json ? saveDocumentJson(sid, did, json) : Promise.resolve(true),
        saveDocumentContent(sid, did, markdown, editUrl),
      ]);

      const success = jsonOk && mdOk;

      if (success) {
        useVoice2RxStore
          .getState()
          .setSessionV2Document(sid, did, { last_saved_at: Math.floor(Date.now() / 1000) });
      }

      useVoice2RxStore.getState().setDocSaveStatus(sid, statusKey, success ? 'synced' : 'error');
      return success;
    } catch {
      useVoice2RxStore.getState().setDocSaveStatus(sid, statusKey, 'error');
      return false;
    }
  }, []);

  return { save };
}
