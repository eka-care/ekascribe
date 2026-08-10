'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import type { TSessionTab } from '@/features/session/components/session-tab-row';
import useVoice2RxStore from '@/store/store';
import { SESSION_PHASE } from '@/constants/enums';
import { addNote, deleteNote, renameDocument } from '../services/document-service';
import { resolveOutputTemplates } from '../utils/resolve-output-templates';
import { clearStreamCache } from '@/features/session/ag-ui/hooks/use-agent-run';
import {
  clearStreamMarkdownCache,
  getStreamMarkdownCache,
} from '@/features/session/ag-ui/hooks/use-stream-editor';
import type { NormalizedDocument } from '../types';

const EMPTY_DOCUMENTS: never[] = [];

const _deletingDocs = new Set<string>();
const _renamingDocs = new Set<string>();

export function useSessionTabs(sessionId: string) {
  // ─── Store selectors ───
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

  // ─── Active tab ───
  const [activeTab, setActiveTab] = useState('transcript');

  // ─── Stream / pending state ───
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

  // ─── Phase transition effects ───
  useEffect(() => {
    if (phase === SESSION_PHASE.PROCESSING && prevPhaseRef.current !== SESSION_PHASE.PROCESSING) {
      setPendingTabs((prev) => prev.filter((t) => !t.id.startsWith('pending-processing-')));
      // No template selected → nothing gets generated; the transcript stays.
      outputFormatTemplates.forEach((t) => addPendingTab(`pending-processing-${t.id}`, t.name));
    }

    if (phase === SESSION_PHASE.ERROR && prevPhaseRef.current === SESSION_PHASE.PROCESSING) {
      setPendingTabs((prev) => prev.filter((t) => !t.id.startsWith('pending-processing-')));
      setActiveTab((cur: string) => (cur.startsWith('pending-processing-') ? 'transcript' : cur));
    }

    if (phase === SESSION_PHASE.OUTPUT && prevPhaseRef.current === SESSION_PHASE.PROCESSING) {
      setPendingTabs((prev) => prev.filter((t) => !t.id.startsWith('pending-processing-')));

      const storeDocs =
        useVoice2RxStore.getState().sessionV2ContentById[sessionId]?.documents ?? [];

      const customDocs = storeDocs.filter((d) => d.document_type === 'custom');
      const successCustomDoc = customDocs.find((d) => d.status === 'success');

      if (successCustomDoc) {
        setActiveTab(successCustomDoc.document_id);
      } else if (customDocs.length === 0 && outputFormatTemplates.length > 0) {
        const now = Date.now();
        const newStreamTabs: TSessionTab[] = outputFormatTemplates.map((t) => ({
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
  }, [phase, documents, outputFormatTemplates, addPendingTab]);

  // Flip finished stream tabs to regular document tabs once their doc lands in the store
  useEffect(() => {
    for (const [streamKey, docId] of streamDocIds) {
      if (!documents.some((d) => d.document_id === docId && d.status !== 'in-progress')) continue;

      if (activeTab === streamKey) setActiveTab(docId);
      setPendingTabs((prev) => prev.filter((t) => t.id !== streamKey));
      setFinishedStreamTabs((prev) => {
        const next = new Set(prev);
        next.delete(streamKey);
        return next;
      });
      setStreamDocIds((prev) => {
        const next = new Map(prev);
        next.delete(streamKey);
        return next;
      });
      clearStreamCache(streamKey);
      clearStreamMarkdownCache(streamKey);
    }
  }, [activeTab, documents, streamDocIds]);

  // ─── Stream handlers ───
  const streamDocIdsRef = useRef(streamDocIds);
  streamDocIdsRef.current = streamDocIds;
  const pendingTabsRef = useRef(pendingTabs);
  pendingTabsRef.current = pendingTabs;

  // Marks the stream done and syncs the finished doc into the store so the tab flips to document view
  const handleStreamFinished = useCallback(
    (streamKey: string) => {
      setFinishedStreamTabs((prev) => new Set(prev).add(streamKey));

      const docId = streamDocIdsRef.current.get(streamKey);
      if (!docId) return;

      const store = useVoice2RxStore.getState();
      const existing = store.sessionV2ContentById[sessionId]?.documents.find(
        (d) => d.document_id === docId
      );
      if (existing) {
        if (existing.status === 'in-progress') {
          store.setSessionV2Document(sessionId, docId, { status: 'success' });
        }
        return;
      }

      store.addSessionV2Document(sessionId, {
        document_id: docId,
        template_id: streamKey.split(':')[1] || '',
        document_name: pendingTabsRef.current.find((t) => t.id === streamKey)?.label || 'Note',
        document_type: 'custom',
        type: 'markdown',
        status: 'success',
        errors: [],
        warnings: [],
        get_url: null,
        edit_url: null,
        content: getStreamMarkdownCache(streamKey) ?? null,
      });
    },
    [sessionId]
  );

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
    []
  );

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

  // ─── Tab CRUD handlers ───
  const handleAddNote = useCallback(async () => {
    const noteCount = documents.filter((d) => d.document_type === 'notes').length;
    const label = `Note ${noteCount + 1}`;
    const pendingId = `pending-note-${Date.now()}`;
    addPendingTab(pendingId, label);
    const newDoc = await addNote(sessionId, label, 'notes', { skipStoreUpdate: true });
    removePendingTab(pendingId);
    if (newDoc) {
      useVoice2RxStore.getState().addSessionV2Document(sessionId, newDoc);
      setActiveTab(newDoc.document_id);
    }
  }, [sessionId, documents, addPendingTab, removePendingTab]);

  const handleDeleteTab = useCallback(
    async (_tabId: string) => {
      let deleteDocId = _tabId;

      if (deleteDocId.startsWith('stream:')) {
        const docId = handleDeleteStream(deleteDocId);
        if (docId) deleteDocId = docId;
      }

      if (_deletingDocs.has(deleteDocId)) return;
      _deletingDocs.add(deleteDocId);

      if (activeTab === _tabId || activeTab === deleteDocId) {
        const remaining = documents.filter(
          (d) => d.document_id !== deleteDocId && d.status !== 'in-progress'
        );
        setActiveTab(
          remaining.length > 0 ? remaining[remaining.length - 1].document_id : 'transcript'
        );
      }

      try {
        await deleteNote(sessionId, deleteDocId);
      } finally {
        _deletingDocs.delete(deleteDocId);
      }
    },
    [sessionId, activeTab, documents, handleDeleteStream]
  );

  const handleRenameTab = useCallback(
    async (tabId: string, newLabel: string) => {
      const docId = tabId.startsWith('stream:') ? streamDocIds.get(tabId)! : tabId;
      if (_renamingDocs.has(docId)) return;
      _renamingDocs.add(docId);

      try {
        await renameDocument(sessionId, docId, newLabel);
      } finally {
        _renamingDocs.delete(docId);
      }
    },
    [sessionId, streamDocIds]
  );

  // ─── Mounted doc tracking ───
  const mountedDocIdsRef = useRef<Set<string>>(new Set());
  const isDocumentTab = documents.some((d) => d.document_id === activeTab);
  if (isDocumentTab) mountedDocIdsRef.current.add(activeTab);
  for (const id of mountedDocIdsRef.current) {
    if (!documents.some((d) => d.document_id === id)) mountedDocIdsRef.current.delete(id);
  }

  // ─── Tab list ───
  const tabs = useMemo<TSessionTab[]>(() => {
    const result: TSessionTab[] = [
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
    // Tab state
    activeTab,
    setActiveTab,
    tabs,

    // Tab CRUD
    handleAddNote,
    handleDeleteTab,
    handleRenameTab,

    // Stream management
    pendingTabs,
    activeStreamTabs,
    finishedStreamTabs,
    streamDocIds,
    streamAgUiRun,
    handleStreamFinished,
    handleStreamDocumentId,
    handleDeleteStream,

    // Pending tab helpers
    addPendingTab,
    removePendingTab,

    // Auto-stream
    autoStreamDocId,
    clearAutoStreamDocId,

    // Mounted docs
    mountedDocIds: mountedDocIdsRef.current,
  };
}
