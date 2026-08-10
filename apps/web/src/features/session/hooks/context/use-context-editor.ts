'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { TiptapEditorHandle } from '../../components/editor/tiptap-wysiwyg-editor';
import useVoice2RxStore from '@/store/store';
import { with401Retry } from '@/fetch-client/api-with-retry';
import * as sdkService from '../../services/sdk-service';
import * as documentService from '../../services/document-service';
import type { NormalizedDocument } from '../../types';
import { useDocumentLoader } from '../document/use-document-loader';

const CONTEXT_DOCUMENT_NAME = 'Add context';

// Module-level dedup: ensures only one context-document creation is in-flight
let activeContextCreatePromise: Promise<string | null> | null = null;
let activeContextCreateSessionId: string | null = null;

export function useContextEditor({
  sessionId,
  loadContent = false,
}: {
  sessionId: string;
  loadContent?: boolean;
}) {
  const contextEditorRef = useRef<TiptapEditorHandle>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Finds the context document for this session from the store
  const contextDoc = useVoice2RxStore((s) => {
    const session = s.sessionV2ContentById[sessionId];
    return session?.context?.find((d) => d.document_type === 'context') || null;
  });

  // Loads document content from backend when loadContent is true
  const { state: loadState } = useDocumentLoader(
    sessionId,
    loadContent ? (contextDoc?.document_id ?? null) : null
  );

  const isLoadingContent = !!contextDoc?.document_id && loadState.status === 'loading';
  const contextContent = loadState.status === 'ready' ? (loadState.initialValue ?? '') : '';
  const contextInitialJSON = loadState.status === 'ready' ? loadState.initialJSON : undefined;

  // Checks if a context document already exists in the store
  const findExistingContextDoc = useCallback((): NormalizedDocument | undefined => {
    const session = useVoice2RxStore.getState().sessionV2ContentById[sessionId];
    return session?.context?.find((d) => d.document_type === 'context');
  }, [sessionId]);

  // Creates a context document if one doesn't exist, deduped across concurrent calls
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

  // Saves editor content (markdown + JSON) to backend
  const saveContext = useCallback(async (): Promise<boolean> => {
    if (!sessionId) return false;

    const doc = findExistingContextDoc();
    if (!doc) return false;

    const instance = contextEditorRef.current?.getInstance();
    const md = instance?.getMarkdown();
    if (md === undefined) return false;
    const json = instance?.getJSON();

    // Flush any pending debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    useVoice2RxStore.getState().setSessionV2Document(sessionId, doc.document_id, {
      content: md,
    });

    const [jsonOk, mdOk] = await Promise.all([
      json
        ? documentService.saveDocumentJson(
            sessionId,
            doc.document_id,
            json as unknown as Record<string, unknown>
          )
        : Promise.resolve(true),
      documentService.saveDocumentContent(sessionId, doc.document_id, md, doc.edit_url),
    ]);

    return jsonOk && mdOk;
  }, [sessionId, findExistingContextDoc]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  useEffect(() => {
    const handleBeforeUnload = () => {
      saveContext();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [saveContext]);

  // Debounced handler that syncs editor markdown to the store on each change
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
    contextInitialJSON,
    contextEditorRef,
    ensureContextDocument,
    saveContext,
    handleContextChange,
    isLoadingContent,
  };
}
