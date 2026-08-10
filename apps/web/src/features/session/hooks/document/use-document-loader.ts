'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { JSONContent } from '@tiptap/core';
import { fetchDocumentContent, fetchDocumentJson } from '../../services/document-service';
import useVoice2RxStore from '@/store/store';

export type DocumentLoaderState =
  | { status: 'loading' }
  | { status: 'ready'; source: 'json'; initialJSON: JSONContent; initialValue?: undefined }
  | { status: 'ready'; source: 'markdown'; initialValue: string; initialJSON?: undefined }
  | { status: 'empty' }
  | { status: 'error'; error: string };

export type DocumentLoaderResult = {
  state: DocumentLoaderState;
  reload: () => void;
  setContent: (json: JSONContent) => void;
};

export function useDocumentLoader(sessionId: string, documentId: string | null): DocumentLoaderResult {
  const [loaderState, setLoaderState] = useState<DocumentLoaderState>({ status: 'loading' });
  const [fetchCount, setFetchCount] = useState(0);
  const currentDocIdRef = useRef<string | null>(null);

  const reload = useCallback(() => setFetchCount((n) => n + 1), []);
  const setContent = useCallback((json: JSONContent) => {
    setLoaderState({ status: 'ready', source: 'json', initialJSON: json });
  }, []);

  useEffect(() => {
    currentDocIdRef.current = documentId;

    if (!documentId) {
      setLoaderState({ status: 'empty' });
      return;
    }

    let cancelled = false;
    setLoaderState({ status: 'loading' });

    (async () => {
      try {
        const { tiptapJson, presignedUrl } = await fetchDocumentJson(sessionId, documentId);
        if (cancelled || currentDocIdRef.current !== documentId) return;

        // Priority 1: structured JSON (tiptap format)
        if (tiptapJson && typeof tiptapJson === 'object') {
          setLoaderState({
            status: 'ready',
            source: 'json',
            initialJSON: tiptapJson as JSONContent,
          });
          return;
        }

        // Priority 2: markdown via presigned URL
        if (presignedUrl) {
          const markdown = await fetchDocumentContent(sessionId, documentId, presignedUrl, false);
          if (cancelled || currentDocIdRef.current !== documentId) return;

          if (markdown !== null) {
            useVoice2RxStore
              .getState()
              .setSessionV2Document(sessionId, documentId, { content: markdown });
            setLoaderState({ status: 'ready', source: 'markdown', initialValue: markdown });
            return;
          }
        }

        // Fetch came back empty — fall back to store content (e.g. seeded by copy-note)
        const storeContent = useVoice2RxStore
          .getState()
          .sessionV2ContentById[sessionId]?.documents.find(
            (d) => d.document_id === documentId
          )?.content;
        if (storeContent) {
          setLoaderState({ status: 'ready', source: 'markdown', initialValue: storeContent });
          return;
        }

        // No content available
        useVoice2RxStore.getState().setSessionV2Document(sessionId, documentId, { content: '' });
        setLoaderState({ status: 'empty' });
      } catch (error) {
        if (cancelled || currentDocIdRef.current !== documentId) return;
        setLoaderState({
          status: 'error',
          error: error instanceof Error ? error.message : 'Failed to load document',
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [documentId, fetchCount]);

  return { state: loaderState, reload, setContent };
}
