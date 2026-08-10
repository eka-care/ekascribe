'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { JSONContent } from '@tiptap/core';

import type { TiptapEditorHandle } from '../../components/editor/tiptap-wysiwyg-editor';
import { useAgentRun } from './use-agent-run';
import { scribeStateToTiptap, scribeStateToMarkdown } from '../editor/scribe-state-converters';
import { useDocumentSaver } from '../../hooks/document/use-document-saver';
import useVoice2RxStore from '@/store/store';

// ─────────────────────────────────────────────────────────────────────────
// In-memory caches — survive tab-switch unmount/remount so the editor can
// re-hydrate locally without hitting the network.
// ─────────────────────────────────────────────────────────────────────────

const streamJsonCache = new Map<string, JSONContent>();
const streamMarkdownCache = new Map<string, string>();

export const getStreamJsonCache = (key: string) => streamJsonCache.get(key);
export const getStreamMarkdownCache = (key: string) => streamMarkdownCache.get(key);
export const clearStreamMarkdownCache = (key: string) => {
  streamMarkdownCache.delete(key);
  streamJsonCache.delete(key);
};

function cacheContent(key: string, json: JSONContent | undefined, markdown: string) {
  if (json) streamJsonCache.set(key, json);
  if (markdown) streamMarkdownCache.set(key, markdown);
}

// ─────────────────────────────────────────────────────────────────────────

type Args = {
  sessionId: string;
  templateId: string;
  streamKey: string;
  onFinished?: (result: { success: boolean; json?: JSONContent }) => void;
  onDocumentId?: (documentId: string) => void;
  documentId?: string;
};

export function useStreamEditor({ sessionId, templateId, streamKey, onFinished, onDocumentId, documentId }: Args) {
  const { state, messages, toolCalls, phase, error, runId } = useAgentRun({
    sessionId,
    templateId,
    streamKey,
    documentId,
  });

  const editorRef = useRef<TiptapEditorHandle>(null);
  const latestMdRef = useRef<string | null>(null);
  const hasSavedOnFinish = useRef(false);

  const saver = useDocumentSaver({
    sessionId,
    documentId: state.document_id ?? '',
    streamKey,
  });

  const readFromEditor = () => {
    const inst = editorRef.current?.getInstance();
    const markdown = inst?.getMarkdown() ?? latestMdRef.current ?? '';
    const json = inst?.getJSON();

    if (markdown) latestMdRef.current = markdown;

    return { json, markdown };
  };

  const saveDocument = useCallback(async () => {
    const { json, markdown } = readFromEditor();

    if (!markdown) return;

    cacheContent(streamKey, json, markdown);
    await saver.save({ json, markdown });
  }, [streamKey, saver]);

  // Auto-save on finish, notify parent after save completes.
  useEffect(() => {
    if (phase !== 'finished' || hasSavedOnFinish.current) return;
    hasSavedOnFinish.current = true;

    const markdown = scribeStateToMarkdown(state);
    const json = scribeStateToTiptap(state);

    (async () => {
      latestMdRef.current = markdown;
      cacheContent(streamKey, json, markdown);
      await saver.save({ json, markdown });
      onFinishedRef.current?.({ success: true, json });
    })();
  }, [phase, state, streamKey, saver]);

  // Save before the page unloads — only if stream is finished
  const saveDocumentRef = useRef(saveDocument);
  saveDocumentRef.current = saveDocument;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  useEffect(() => {
    const handler = () => {
      if (phaseRef.current === 'finished') saveDocumentRef.current();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // Update the cache on unmount (tab switch)
  useEffect(() => {
    return () => {
      const { json, markdown } = readFromEditor();
      if (markdown) cacheContent(streamKey, json, markdown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamKey]);

  // ───────────────────────────────────────────────────────────────────────
  // Streaming side effects (parent notifications, pushing state into editor)
  // ───────────────────────────────────────────────────────────────────────

  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;
  const onDocumentIdRef = useRef(onDocumentId);
  onDocumentIdRef.current = onDocumentId;

  // Notify parent on stream error (success is notified from the auto-save effect above)
  useEffect(() => {
    if (phase === 'error') onFinishedRef.current?.({ success: false });
  }, [phase]);

  useEffect(() => {
    if (state.document_id) onDocumentIdRef.current?.(state.document_id);
  }, [state.document_id]);

  // Push ScribeState → Tiptap JSON while streaming. Stops once finished so
  // user edits aren't clobbered.
  const syncFrozen = useRef(false);
  useEffect(() => {
    if (syncFrozen.current) return;
    const instance = editorRef.current?.getInstance();
    if (!instance) return;
    instance.setJSON(scribeStateToTiptap(state));
    if (phase === 'finished') syncFrozen.current = true;
  }, [state, phase]);

  // ───────────────────────────────────────────────────────────────────────
  // Editor callbacks
  // ───────────────────────────────────────────────────────────────────────

  const handleChange = useCallback(() => {
    const md = editorRef.current?.getInstance()?.getMarkdown();
    if (md !== undefined && md !== null) latestMdRef.current = md;
    useVoice2RxStore.getState().setDocSaveStatus(sessionId, streamKey, 'typing');
  }, [sessionId, streamKey]);

  const handleBlur = useCallback(async () => {
    if (phaseRef.current !== 'finished') return;

    const status =
      useVoice2RxStore.getState().sessionV2ContentById[sessionId]?.ui?.save_status_by_doc?.[
        streamKey
      ];
    if (status !== 'typing') return;

    await saveDocument();
  }, [sessionId, streamKey, saveDocument]);

  // ───────────────────────────────────────────────────────────────────────

  // Initial content: prefer cached JSON (preserves custom nodes); fall back
  // to converting the current ScribeState.
  const initialJSON = streamJsonCache.get(streamKey) ?? scribeStateToTiptap(state);

  const getMarkdown = useCallback(
    () =>
      editorRef.current?.getInstance()?.getMarkdown() ??
      latestMdRef.current ??
      scribeStateToMarkdown(state),
    [state]
  );

  return {
    state,
    messages,
    toolCalls,
    phase,
    error,
    runId,
    editorRef,
    initialJSON,
    handleChange,
    handleBlur,
    saveDocument,
    getMarkdown,
  };
}
