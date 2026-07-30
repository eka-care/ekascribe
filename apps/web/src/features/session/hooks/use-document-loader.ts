'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { JSONContent } from '@tiptap/core';

import { fetchDocumentContent, fetchDocumentJson } from '../services/document-service';
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

export function useDocumentLoader(sessionId: string, documentId: string | null | undefined): DocumentLoaderResult {
  const [state, setState] = useState<DocumentLoaderState>({ status: 'loading' });
  const [fetchCount, setFetchCount] = useState(0);
  const currentDocIdRef = useRef<string | null | undefined>(null);

  const reload = useCallback(() => setFetchCount((n) => n + 1), []);
  // Set content directly, skipping the network fetch.
  const setContent = useCallback((json: JSONContent) => {
    setState({ status: 'ready', source: 'json', initialJSON: json });
  }, []);

  useEffect(() => {
    currentDocIdRef.current = documentId;

    if (!documentId) {
      setState({ status: 'empty' });
      return;
    }

    let cancelled = false;
    setState({ status: 'loading' });

    (async () => {
      try {
        // Single getDocument call — returns tiptap_json and presigned_url
        const { tiptapJson, presignedUrl } = await fetchDocumentJson(sessionId, documentId);
        if (cancelled || currentDocIdRef.current !== documentId) return;

        // Priority 1: tiptap_json
        if (tiptapJson && typeof tiptapJson === 'object') {
          setState({
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
            setState({ status: 'ready', source: 'markdown', initialValue: markdown });
            return;
          }
        }

        // Neither available — caller should trigger streaming
        useVoice2RxStore.getState().setSessionV2Document(sessionId, documentId, { content: '' });
        setState({ status: 'empty' });
      } catch (error) {
        if (cancelled || currentDocIdRef.current !== documentId) return;
        setState({
          status: 'error',
          error: error instanceof Error ? error.message : 'Failed to load document',
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [documentId, fetchCount]);

  return { state, reload, setContent };
}
