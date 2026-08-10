'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { JSONContent } from '@tiptap/core';

import type { TiptapEditorHandle } from '../../components/editor/tiptap-wysiwyg-editor';
import { useDocumentLoader, type DocumentLoaderState } from './use-document-loader';
import { useDocumentSaver } from './use-document-saver';
import useVoice2RxStore from '@/store/store';
import type { NormalizedDocument } from '../../types';

type Args = {
  sessionId: string;
  documentId: string;
};

export type DocumentEditorResult = {
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

export function useDocumentEditor({ sessionId, documentId }: Args): DocumentEditorResult {
  const {
    state: loaderState,
    reload: reloadDocument,
    setContent: setDocumentContent,
  } = useDocumentLoader(sessionId, documentId);

  const saver = useDocumentSaver({ sessionId, documentId });

  const editorRef = useRef<TiptapEditorHandle>(null);
  const latestMdRef = useRef<string | null>(null);

  const doc = useVoice2RxStore((s) => {
    const session = s.sessionV2ContentById[sessionId];
    if (!session) return null;
    return session.documents.find((d) => d.document_id === documentId) ?? null;
  });

  // Stable refs so callbacks don't recreate on every doc/saver update
  const docRef = useRef(doc);
  docRef.current = doc;

  const saverRef = useRef(saver);
  saverRef.current = saver;

  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  const documentIdRef = useRef(documentId);
  documentIdRef.current = documentId;

  // Fallback chain: editor instance → cached markdown → loader initial value
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

    return saverRef.current.save({ json, markdown: md });
  }, []);

  // Cache latest markdown and mark status as typing
  const handleChange = useCallback(() => {
    const md = editorRef.current?.getInstance()?.getMarkdown();
    if (md !== undefined && md !== null) latestMdRef.current = md;
    useVoice2RxStore
      .getState()
      .setDocSaveStatus(sessionIdRef.current, documentIdRef.current, 'typing');
  }, []);

  // Auto-save on blur if user was typing
  const handleBlur = useCallback(async () => {
    const currentStatus =
      useVoice2RxStore.getState().sessionV2ContentById[sessionIdRef.current]?.ui
        ?.save_status_by_doc?.[documentIdRef.current];
    if (currentStatus !== 'typing') return;
    await saveDocument();
  }, [saveDocument]);

  // Reload document when triggered externally (e.g. after regeneration)
  const pendingReloadDocId = useVoice2RxStore(
    (s) => s.sessionV2ContentById[sessionId]?.ui?.pending_reload_doc_id ?? null
  );
  useEffect(() => {
    if (pendingReloadDocId !== documentId) return;
    useVoice2RxStore.getState().setSessionV2Ui(sessionId, { pending_reload_doc_id: null });
    reloadDocument();
  }, [pendingReloadDocId, documentId, sessionId, reloadDocument]);

  // Save unsaved changes before page unload — dirty docs only, a no-op save would unpublish
  const saveDocumentRef = useRef(saveDocument);
  saveDocumentRef.current = saveDocument;
  useEffect(() => {
    const handleBeforeUnload = () => {
      const status =
        useVoice2RxStore.getState().sessionV2ContentById[sessionIdRef.current]?.ui
          ?.save_status_by_doc?.[documentIdRef.current];
      if (status === 'typing') saveDocumentRef.current();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Derive editor init payload from loader state
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
