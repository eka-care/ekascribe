'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { TiptapEditorHandle } from '../components/editor/tiptap-wysiwyg-editor';
import useVoice2RxStore from '@/store/store';
import { with401Retry } from '@/fetch-client/api-with-retry';
import * as sdkService from '../services/sdk-service';
import * as documentService from '../services/document-service';
import type { NormalizedDocument } from '../types';

const CONTEXT_DOCUMENT_NAME = 'Add context';

// Module-level dedup: ensures only one context-document creation is in-flight
let activeContextCreatePromise: Promise<string | null> | null = null;
let activeContextCreateSessionId: string | null = null;

export function useContextTab({ sessionId }: { sessionId: string }) {
  const contextEditorRef = useRef<TiptapEditorHandle>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Read context doc and content from V2 store
  const contextDoc = useVoice2RxStore((s) => {
    const session = s.sessionV2ContentById[sessionId];
    return session?.context?.find((d) => d.document_type === 'context') || null;
  });

  const contextContent = contextDoc?.content || '';
  const isLoadingContent =
    !!contextDoc?.document_id && contextDoc.content === null && !!contextDoc.get_url;

  // Fetch context content from presigned URL on mount when doc exists but content is null
  useEffect(() => {
    if (!contextDoc?.document_id || contextDoc.content !== null) return;
    if (!contextDoc.get_url) return;

    documentService
      .fetchDocumentContent(sessionId, contextDoc.document_id, contextDoc.get_url, false)
      .then((content) => {
        useVoice2RxStore.getState().setSessionV2Document(sessionId, contextDoc.document_id, {
          content: content ?? '',
        });
      })
      .catch(() => {
        useVoice2RxStore.getState().setSessionV2Document(sessionId, contextDoc.document_id, {
          content: '',
        });
      });
  }, [contextDoc?.document_id, sessionId]);

  // Check if a context document already exists in the V2 store
  const findExistingContextDoc = useCallback((): NormalizedDocument | undefined => {
    const session = useVoice2RxStore.getState().sessionV2ContentById[sessionId];
    return session?.context?.find((d) => d.document_type === 'context');
  }, [sessionId]);

  const ensureContextDocument = useCallback(async (): Promise<string | null> => {
    if (!sessionId) return null;

    // Check store first
    const existing = findExistingContextDoc();
    if (existing) return existing.document_id;

    // If creation already in-flight for this session, wait for it
    if (activeContextCreatePromise && activeContextCreateSessionId === sessionId) {
      return activeContextCreatePromise;
    }

    const createPromise = (async () => {
      try {
        const response = await with401Retry(
          () =>
            sdkService.createDocument({
              session_id: sessionId,
              document_name: CONTEXT_DOCUMENT_NAME,
              type: 'context',
            }),
          'create context document'
        );

        if (response.status_code >= 400 || !response.data?.document_id) {
          return null;
        }

        const documentId = response.data.document_id;

        const newDoc: NormalizedDocument = {
          document_id: documentId,
          template_id: response.data.template_id || '',
          document_name: CONTEXT_DOCUMENT_NAME,
          document_type: 'context',
          type: 'markdown',
          status: 'success',
          errors: [],
          warnings: [],
          publish: {},
          get_url: null,
          edit_url: (response.data.presigned_url as string) || null,
          content: null,
        };

        useVoice2RxStore.getState().addSessionV2Document(sessionId, newDoc);
        return documentId;
      } finally {
        activeContextCreatePromise = null;
        activeContextCreateSessionId = null;
      }
    })();

    activeContextCreatePromise = createPromise;
    activeContextCreateSessionId = sessionId;
    return createPromise;
  }, [sessionId, findExistingContextDoc]);

  const saveContext = useCallback(async (): Promise<boolean> => {
    if (!sessionId) return false;

    const doc = findExistingContextDoc();
    if (!doc) return false;

    const md = contextEditorRef.current?.getInstance()?.getMarkdown();
    if (md === undefined) return false;

    // Flush any pending debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    // Write to store
    useVoice2RxStore.getState().setSessionV2Document(sessionId, doc.document_id, {
      content: md,
    });

    return documentService.saveDocumentContent(sessionId, doc.document_id, md, doc.edit_url);
  }, [sessionId, findExistingContextDoc]);

  // Save unsaved changes before page unload (refresh/close)
  useEffect(() => {
    const handleBeforeUnload = () => {
      saveContext();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [saveContext]);

  const handleContextChange = useCallback(() => {
    const doc = findExistingContextDoc();
    if (!doc) return;

    const md = contextEditorRef.current?.getInstance()?.getMarkdown();
    if (md === undefined) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      useVoice2RxStore.getState().setSessionV2Document(sessionId, doc.document_id, {
        content: md,
      });
    }, 300);
  }, [sessionId, findExistingContextDoc]);

  return {
    contextContent,
    contextEditorRef,
    ensureContextDocument,
    saveContext,
    handleContextChange,
    isLoadingContent,
  };
}
