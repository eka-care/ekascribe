'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import type { TSessionTab } from '@/features/session/components/session-tab-row';
import useVoice2RxStore from '@/store/store';
import { SESSION_PHASE } from '@/constants/enums';
import { resolveOutputTemplates } from '../utils/resolve-output-templates';
import { clearStreamCache } from '@/features/session/ag-ui/hooks/use-stream-template-run';
import { clearStreamMarkdownCache } from '@/features/session/ag-ui/hooks/use-stream-tab';
import type { NormalizedDocument } from '../types';

const EMPTY_DOCUMENTS: never[] = [];

type UseDocumentStreamingArgs = {
  sessionId: string;
  activeTab: string;
  setActiveTab: (tab: string | ((prev: string) => string)) => void;
};

export type DocumentStreamingResult = {
  pendingTabs: TSessionTab[];
  finishedStreamTabs: Set<string>;
  streamDocIds: Map<string, string>;
  activeStreamTabs: TSessionTab[];
  addPendingTab: (id: string, label: string) => void;
  removePendingTab: (id: string) => void;
  handleStreamFinished: (streamKey: string) => void;
  handleStreamDocumentId: (streamKey: string, docId: string) => void;
  streamAgUiRun: (template: { id: string; name: string }, closePopover: () => void) => void;
  handleDeleteStream: (streamTabId: string) => string | undefined;
  tabs: TSessionTab[];
  outputFormatTemplates: { id: string; name: string }[];
  autoStreamDocId: string | null;
  clearAutoStreamDocId: () => void;
};

export function useDocumentStreaming({
  sessionId,
  activeTab,
  setActiveTab,
}: UseDocumentStreamingArgs): DocumentStreamingResult {
  const phase = useVoice2RxStore(
    (s) => s.sessionV2ContentById[sessionId]?.phase || SESSION_PHASE.IDLE
  );
  const documents = useVoice2RxStore(
    (s) => s.sessionV2ContentById[sessionId]?.documents ?? EMPTY_DOCUMENTS
  );
  const sessionTemplates = useVoice2RxStore(
    (s) => s.sessionV2ContentById[sessionId]?.session_config?.output_format_template
  );
  const defaultTemplates = useVoice2RxStore((s) => s.userLevelPreferences.output_format_template);
  const templateNameById = useVoice2RxStore((s) => s.templateNameById);

  const outputFormatTemplates = useMemo(() => {
    const base = resolveOutputTemplates(sessionTemplates, defaultTemplates);
    return base.map((t) => ({ ...t, name: templateNameById[t.id] || t.name }));
  }, [sessionTemplates, defaultTemplates, templateNameById]);

  const [pendingTabs, setPendingTabs] = useState<TSessionTab[]>([]);
  const [finishedStreamTabs, setFinishedStreamTabs] = useState<Set<string>>(() => new Set());
  const [streamDocIds, setStreamDocIds] = useState<Map<string, string>>(() => new Map());
  const [autoStreamDocId, setAutoStreamDocId] = useState<string | null>(null);
  const prevPhaseRef = useRef(phase);

  const clearAutoStreamDocId = useCallback(() => setAutoStreamDocId(null), []);

  const addPendingTab = useCallback((id: string, label: string) => {
    setPendingTabs((prev) => [...prev, { id, label, loading: true }]);
  }, []);

  const removePendingTab = useCallback((id: string) => {
    setPendingTabs((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Phase transition handling
  useEffect(() => {
    if (phase === SESSION_PHASE.PROCESSING && prevPhaseRef.current !== SESSION_PHASE.PROCESSING) {
      setPendingTabs((prev) => prev.filter((t) => !t.id.startsWith('pending-processing-')));
      const templates =
        outputFormatTemplates.length > 0
          ? outputFormatTemplates
          : [{ id: 'default', name: 'Notes' }];
      templates.forEach((t) => addPendingTab(`pending-processing-${t.id}`, t.name));
    }

    if (phase === SESSION_PHASE.ERROR && prevPhaseRef.current === SESSION_PHASE.PROCESSING) {
      setPendingTabs((prev) => prev.filter((t) => !t.id.startsWith('pending-processing-')));
      setActiveTab((cur: string) => (cur.startsWith('pending-processing-') ? 'transcript' : cur));
    }

    // PROCESSING → OUTPUT: land on the right tab
    if (phase === SESSION_PHASE.OUTPUT && prevPhaseRef.current === SESSION_PHASE.PROCESSING) {
      setPendingTabs((prev) => prev.filter((t) => !t.id.startsWith('pending-processing-')));

      const storeDocs =
        useVoice2RxStore.getState().sessionV2ContentById[sessionId]?.documents ?? [];

      const customDocs = storeDocs.filter((d) => d.document_type === 'custom');
      const successCustomDoc = customDocs.find((d) => d.status === 'success');

      if (successCustomDoc) {
        setActiveTab(successCustomDoc.document_id);
      } else if (customDocs.length === 0) {
        // No custom docs — start AG-UI streams
        const templates =
          outputFormatTemplates.length > 0
            ? outputFormatTemplates
            : [{ id: 'default', name: 'Notes' }];
        const now = Date.now();
        const newStreamTabs: TSessionTab[] = templates.map((t) => ({
          id: `stream:${t.id}:${now}`,
          label: t.name,
          closable: true,
        }));
        setPendingTabs((prev) => [...prev, ...newStreamTabs]);
        if (newStreamTabs.length > 0) {
          setActiveTab(newStreamTabs[0].id);
        }
      } else {
        const inProgressDoc = customDocs.find((d) => d.status === 'in-progress');
        if (inProgressDoc) {
          setActiveTab(inProgressDoc.document_id);
          setAutoStreamDocId(inProgressDoc.document_id);
        } else {
          setActiveTab(storeDocs[0].document_id);
        }
      }
    }
    prevPhaseRef.current = phase;
  }, [phase, documents, outputFormatTemplates, addPendingTab, setActiveTab]);

  // When a stream tab's document appears in backend with non-in-progress status, switch to it
  useEffect(() => {
    if (!activeTab.startsWith('stream:')) return;
    const docId = streamDocIds.get(activeTab);
    if (!docId) return;
    if (!documents.some((d) => d.document_id === docId && d.status !== 'in-progress')) return;

    setActiveTab(docId);
    setPendingTabs((prev) => prev.filter((t) => t.id !== activeTab));
    setFinishedStreamTabs((prev) => {
      const next = new Set(prev);
      next.delete(activeTab);
      return next;
    });
    setStreamDocIds((prev) => {
      const next = new Map(prev);
      next.delete(activeTab);
      return next;
    });
    clearStreamCache(activeTab);
    clearStreamMarkdownCache(activeTab);
  }, [activeTab, documents, streamDocIds, setActiveTab]);

  const handleStreamFinished = useCallback((streamKey: string) => {
    setFinishedStreamTabs((prev) => new Set(prev).add(streamKey));
  }, []);

  const handleStreamDocumentId = useCallback((streamKey: string, docId: string) => {
    setStreamDocIds((prev) => {
      if (prev.get(streamKey) === docId) return prev;
      return new Map(prev).set(streamKey, docId);
    });
  }, []);

  const streamAgUiRun = useCallback(
    (template: { id: string; name: string }, closePopover: () => void) => {
      closePopover();
      const streamId = `stream:${template.id}:${Date.now()}`;
      setPendingTabs((prev) => [...prev, { id: streamId, label: template.name, closable: true }]);
      setActiveTab(streamId);
    },
    [setActiveTab]
  );

  // Returns the resolved document ID for deletion (or undefined if no doc associated)
  const handleDeleteStream = useCallback(
    (streamTabId: string): string | undefined => {
      const docId = streamDocIds.get(streamTabId);
      setPendingTabs((prev) => prev.filter((t) => t.id !== streamTabId));
      clearStreamCache(streamTabId);
      clearStreamMarkdownCache(streamTabId);
      setFinishedStreamTabs((prev) => {
        const next = new Set(prev);
        next.delete(streamTabId);
        return next;
      });
      setStreamDocIds((prev) => {
        const next = new Map(prev);
        next.delete(streamTabId);
        return next;
      });
      return docId;
    },
    [streamDocIds]
  );

  const activeStreamTabs = useMemo(
    () => pendingTabs.filter((t) => t.id.startsWith('stream:')),
    [pendingTabs]
  );

  // Build the full tabs list
  const tabs = useMemo<TSessionTab[]>(() => {
    const result: TSessionTab[] = [
      { id: 'records', label: 'Records' },
      { id: 'context', label: 'Add context' },
      { id: 'transcript', label: 'Transcript' },
    ];

    const activeStreamDocIdSet = new Set(streamDocIds.values());
    documents.forEach((doc: NormalizedDocument) => {
      if (activeStreamDocIdSet.has(doc.document_id)) return;
      result.push({
        id: doc.document_id,
        label: doc.document_name || 'Note',
        closable: true,
      });
    });

    const completedDocIds = new Set(
      documents
        .filter((d: NormalizedDocument) => d.status !== 'in-progress')
        .map((d: NormalizedDocument) => d.document_id)
    );
    const filteredPending = pendingTabs.filter((t) => {
      if (!t.id.startsWith('stream:')) return true;
      const docId = streamDocIds.get(t.id);
      return !docId || !completedDocIds.has(docId);
    });
    return [...result, ...filteredPending];
  }, [documents, pendingTabs, streamDocIds]);

  return {
    pendingTabs,
    finishedStreamTabs,
    streamDocIds,
    activeStreamTabs,
    addPendingTab,
    removePendingTab,
    handleStreamFinished,
    handleStreamDocumentId,
    streamAgUiRun,
    handleDeleteStream,
    tabs,
    outputFormatTemplates,
    autoStreamDocId,
    clearAutoStreamDocId,
  };
}
