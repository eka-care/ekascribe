'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { JSONContent } from '@tiptap/core';

import type { TiptapEditorHandle } from '../components/editor/tiptap-wysiwyg-editor';
import { useDocumentLoader, type DocumentLoaderState } from './use-document-loader';
import { useDocumentSaver } from './use-document-saver';
import { unpublishDoc } from '../services/document-service';
import useVoice2RxStore from '@/store/store';
import type { NormalizedDocument } from '../types';

type Args = {
  sessionId: string;
  documentId: string;
};

export type DocumentTabResult = {
  doc: NormalizedDocument | null;
  loaderState: DocumentLoaderState;
  reloadDocument: () => void;
  setDocumentContent: (json: JSONContent) => void;
  editorRef: React.RefObject<TiptapEditorHandle | null>;
  initialJSON: JSONContent | undefined;
  initialValue: string;
  handleChange: () => void;
  handleBlur: () => Promise<void>;
  saveDocument: () => Promise<boolean>;
  getMarkdown: () => string;
};

export function useDocumentTab({ sessionId, documentId }: Args): DocumentTabResult {
  const { state: loaderState, reload: reloadDocument, setContent: setDocumentContent } = useDocumentLoader(
    sessionId,
    documentId
  );
  const saver = useDocumentSaver({ sessionId, documentId });

  const editorRef = useRef<TiptapEditorHandle>(null);
  const latestMdRef = useRef<string | null>(null);

  // Doc metadata (status, name, publish state) comes from the store.
  const doc = useVoice2RxStore((s) => {
    const session = s.sessionV2ContentById[sessionId];
    if (!session) return null;
    return session.documents.find((d) => d.document_id === documentId) ?? null;
  });

  // Stable refs so callbacks don't recreate on every doc update.
  const docRef = useRef(doc);
  docRef.current = doc;

  const saverRef = useRef(saver);
  saverRef.current = saver;

  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  const documentIdRef = useRef(documentId);
  documentIdRef.current = documentId;

  const getMarkdown = useCallback(() => {
    const md = editorRef.current?.getInstance()?.getMarkdown();
    if (md !== undefined && md !== null) return md;
    if (latestMdRef.current !== null) return latestMdRef.current;
    if (loaderState.status === 'ready' && loaderState.source === 'markdown') {
      return loaderState.initialValue;
    }
    return '';
  }, [loaderState]);

  const saveDocument = useCallback(async (): Promise<boolean> => {
    const md = editorRef.current?.getInstance()?.getMarkdown() ?? latestMdRef.current;
    if (md === null || md === undefined) return false;
    const json = editorRef.current?.getInstance()?.getJSON();

    // If the document was previously published, unpublish before saving so
    // downstream consumers don't see a stale "success" status on edits.
    const publishStatus = (docRef.current?.publish?.emr_webhook as { status?: string } | undefined)
      ?.status;
    if (publishStatus === 'success' && docRef.current?.document_id) {
      unpublishDoc(sessionIdRef.current, docRef.current.document_id);
    }

    return saverRef.current.save({ json, markdown: md });
  }, []);

  // --- Editor callbacks ---
  const handleChange = useCallback(() => {
    const md = editorRef.current?.getInstance()?.getMarkdown();
    if (md !== undefined && md !== null) latestMdRef.current = md;
    useVoice2RxStore
      .getState()
      .setDocSaveStatus(sessionIdRef.current, documentIdRef.current, 'typing');
  }, []);

  const handleBlur = useCallback(async () => {
    const currentStatus =
      useVoice2RxStore.getState().sessionV2ContentById[sessionIdRef.current]?.ui
        ?.save_status_by_doc?.[documentIdRef.current];
    if (currentStatus !== 'typing') return;
    await saveDocument();
  }, [saveDocument]);

  // Save unsaved changes before page unload.
  const saveDocumentRef = useRef(saveDocument);
  saveDocumentRef.current = saveDocument;
  useEffect(() => {
    const handleBeforeUnload = () => saveDocumentRef.current();
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Derive editor-init payload from loader state.
  const initialJSON =
    loaderState.status === 'ready' && loaderState.source === 'json'
      ? loaderState.initialJSON
      : undefined;
  const initialValue =
    loaderState.status === 'ready' && loaderState.source === 'markdown'
      ? loaderState.initialValue
      : '';

  return {
    doc,
    loaderState,
    reloadDocument,
    setDocumentContent,
    editorRef,
    initialJSON,
    initialValue,
    handleChange,
    handleBlur,
    saveDocument,
    getMarkdown,
  };
}
