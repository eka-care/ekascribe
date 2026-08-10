'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { TriangleAlert, CheckCircle2 } from 'lucide-react';
import useVoice2RxStore from '@/store/store';
import SessionTabRow from '@/features/session/components/session-tab-row';
import SessionAlert from '@/features/session/utils/session-alert';
import { AddOrConvertPopover } from '@/features/session/components/dialogs/add-or-convert-popover';
import {
  printDocument,
  addNote,
  deleteNote,
  renameDocument,
  publishDoc,
} from '@/features/session/services/document-service';
import LinkPastSessionsDialog from './dialogs/link-past-sessions-dialog';
import WhatsAppSendDialog from './dialogs/whatsapp-send-dialog';
import { useCapabilities } from '@/platform';
import { SessionBodySkeleton } from '@/app/new-session/loading';
import AnalysingStateDisplay from './output/analysing-component';
import ErrorComponent, { getSessionErrorContent } from './output/error-component';
import { ContextTabContent } from './tabs/context-tab-content';
import { TranscriptTabContent } from './tabs/transcript-tab-content';
import { SessionDocument, type SessionDocumentHandle } from './tabs/session-document';
import { TabFooter } from './tabs/tab-footer';
import {
  getContextFooterConfig,
  getDocumentFooterConfig,
  getTranscriptFooterConfig,
  getErrorFooterConfig,
  getChunkLimitFooterConfig,
} from '../config/tab-footer-config';
import type { TabFooterConfig } from '../config/tab-footer-config';
import { useSessionContext } from '../hooks/use-session-context';
import { useContextTab } from '../hooks/use-context-tab';
import { useErrorHandlers } from '../hooks/use-error-handlers';
import { useSessionLifecycle } from '../hooks/use-session-lifecycle';
import { copyMarkdownToClipboard } from '../utils/copy-output-utils';
import { useConvertTemplate } from '../hooks/use-convert-template';
import { useCopyFromSession } from '../hooks/use-copy-from-session';
import { useSavedNotes, type SavedNote } from '../hooks/use-saved-notes';
import { useSessionLimitGuard } from '../hooks/use-session-limit-guard';
import { SESSION_PHASE } from '@/constants/enums';
import { useDocumentStreaming } from '../hooks/use-document-streaming';
import type { NormalizedDocument } from '../types';
import type { TPastSessionHistoryData } from '@/constants/types';

interface SessionBodyProps {
  sessionId: string;
  onAddTranscript?: () => void;
  isLimitExceeded?: boolean;
}

const EMPTY_DOCUMENTS: never[] = [];
const EMPTY_TRANSCRIPT: never[] = [];

const _deletingDocs = new Set<string>();
const _convertingTemplates = new Set<string>();
const _renamingDocs = new Set<string>();

const SessionBody = ({ sessionId, onAddTranscript, isLimitExceeded }: SessionBodyProps) => {
  const limitGuard = useSessionLimitGuard({
    isLimitExceeded: !!isLimitExceeded,
  });

  const phase = useVoice2RxStore(
    (s) => s.sessionV2ContentById[sessionId]?.phase || SESSION_PHASE.IDLE
  );
  const sessionError = useVoice2RxStore((s) => s.sessionV2ContentById[sessionId]?.error ?? null);

  const documents = useVoice2RxStore(
    (s) => s.sessionV2ContentById[sessionId]?.documents ?? EMPTY_DOCUMENTS
  );
  const transcriptDocs = useVoice2RxStore(
    (s) => s.sessionV2ContentById[sessionId]?.transcript ?? EMPTY_TRANSCRIPT
  );
  const patientOid = useVoice2RxStore(
    (s) => s.sessionV2ContentById[sessionId]?.patient_details?.oid
  );
  const selectedPatientDetails = useVoice2RxStore(
    (s) => s.sessionV2ContentById[sessionId]?.patient_details ?? null
  );
  const uiLoading = useVoice2RxStore(
    (s) => s.sessionV2ContentById[sessionId]?.ui?.loading || false
  );
  const userStatus = useVoice2RxStore((s) => s.sessionV2ContentById[sessionId]?.user_status || '');
  const selectedTranscriptLang = useVoice2RxStore(
    (s) => s.sessionV2ContentById[sessionId]?.ui?.selected_transcript_lang || ''
  );
  const userSelectedTemplatesList = useVoice2RxStore((s) => s.userSelectedTemplatesList);

  const warningMessage = useVoice2RxStore((s) => s.warningMessage);
  const warningType = useVoice2RxStore((s) => s.warningType);
  const warningScreen = useVoice2RxStore((s) => s.warningScreen);
  const warningListHeader = useVoice2RxStore((s) => s.warningListHeader);
  const warningListItems = useVoice2RxStore((s) => s.warningListItems);
  const WarningAction = useVoice2RxStore((s) => s.warningAction);
  const clearWarningInfo = useVoice2RxStore((s) => s.clearWarningInfo);

  const [activeTab, setActiveTab] = useState('transcript');

  const [whatsappSendOpen, setWhatsappSendOpen] = useState(false);
  const [whatsappSendDoc, setWhatsappSendDoc] = useState<{ id: string; name: string } | null>(null);
  const loggedInUserDetails = useVoice2RxStore((s) => s.loggedInUserDetails);
  const hasWhatsApp = useCapabilities().has('whatsapp-linked-device');
  const streamRef = useRef<SessionDocumentHandle>(null);
  const documentRef = useRef<SessionDocumentHandle>(null);

  const saveStatus = useVoice2RxStore(
    (s) => s.sessionV2ContentById[sessionId]?.ui?.save_status_by_doc?.[activeTab] || 'idle'
  );

  const { ensureContextDocument } = useContextTab({ sessionId });
  const sessionContext = useSessionContext({ sessionId, patientOid });
  const { handleTryAgain, handleDiscard, handleContinueRecording } = useErrorHandlers();
  const { endRecording } = useSessionLifecycle();
  const { convertTemplate } = useConvertTemplate(sessionId);
  const copyFromSession = useCopyFromSession({ sessionId, patientOid });
  const savedNotes = useSavedNotes();

  const showConvertOption = userStatus === 'commit';

  const hasTranscriptContent = useMemo(
    () => transcriptDocs.some((t) => t.status === 'success'),
    [transcriptDocs]
  );

  // --- Document streaming hook ---
  const streaming = useDocumentStreaming({ sessionId, activeTab, setActiveTab });
  const {
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
    autoStreamDocId,
    clearAutoStreamDocId,
  } = streaming;

  const isContextTab = activeTab === 'context';
  const isTranscriptTab = activeTab === 'transcript';
  const isStreamTab = activeTab.startsWith('stream:');
  const activeDoc = documents.find((d) => d.document_id === activeTab);
  const isDocumentTab = !!activeDoc;

  // Keep visited document tabs mounted so streaming survives tab switches.
  const mountedDocIdsRef = useRef<Set<string>>(new Set());
  if (isDocumentTab) mountedDocIdsRef.current.add(activeTab);
  // Clean up deleted docs
  for (const id of mountedDocIdsRef.current) {
    if (!documents.some((d) => d.document_id === id)) mountedDocIdsRef.current.delete(id);
  }

  // --- Tab handlers ---
  const handleTabChange = useCallback(
    async (tabId: string) => {
      clearAutoStreamDocId();

      if (isStreamTab && finishedStreamTabs.has(activeTab)) {
        streamRef.current?.save();
      } else if (isDocumentTab) {
        documentRef.current?.save();
      }

      setActiveTab(tabId);
      sessionContext.setShowLinkDialog(false);

      if (tabId === 'context') {
        await ensureContextDocument();
      }
    },
    [
      sessionContext,
      ensureContextDocument,
      isStreamTab,
      isDocumentTab,
      activeTab,
      finishedStreamTabs,
      clearAutoStreamDocId,
    ]
  );

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
        const remaining = documents.filter((d) => d.document_id !== deleteDocId && d.status !== 'in-progress');
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

  const handleCopyDocument = useCallback(async () => {
    const md = documentRef.current?.getMarkdown() || activeDoc?.content;
    if (!md) return;
    await copyMarkdownToClipboard(md);
  }, [activeDoc]);

  const handleConvertTemplate = useCallback(
    async (template: { id: string; name: string }, closePopover: () => void) => {
      if (_convertingTemplates.has(template.id)) return;
      _convertingTemplates.add(template.id);

      closePopover();
      const pendingId = `pending-convert-${template.id}`;
      addPendingTab(pendingId, template.name);

      try {
        const newDocId = await convertTemplate(template);
        removePendingTab(pendingId);
        if (newDocId) setActiveTab(newDocId);
      } finally {
        _convertingTemplates.delete(template.id);
      }
    },
    [convertTemplate, addPendingTab, removePendingTab]
  );

  const handlePickCopyNote = useCallback(
    async (
      note: NormalizedDocument,
      session: TPastSessionHistoryData,
      closePopover: () => void
    ) => {
      closePopover();
      const pendingId = `pending-copy-note-${note.document_id}`;
      addPendingTab(pendingId, note.document_name || 'Note');

      try {
        const newDocId = await copyFromSession.copyNoteIntoSession(session.txn_id, note);
        if (newDocId) setActiveTab(newDocId);
      } finally {
        removePendingTab(pendingId);
      }
    },
    [copyFromSession, addPendingTab, removePendingTab]
  );

  const handleSaveNote = useCallback(
    async (documentId: string, documentName: string) => {
      const success = await savedNotes.saveNote(documentId, documentName);
      if (success) {
        toast.success('Note saved');
      } else {
        toast.error('Failed to save note');
      }
    },
    [savedNotes]
  );

  const handlePublish = useCallback(
    async (documentId: string) => {
      const success = await publishDoc(sessionId, documentId);
      if (success) {
        toast.success('Published');
      } else {
        toast.error('Failed to publish');
      }
    },
    [sessionId]
  );

  const handlePickSavedNote = useCallback(
    async (note: SavedNote, closePopover: () => void) => {
      closePopover();
      const pendingId = `pending-saved-note-${note.document_id}`;
      addPendingTab(pendingId, note.document_name || 'Note');

      try {
        const newDocId = await copyFromSession.copyNoteIntoSession(sessionId, {
          document_id: note.document_id,
          document_name: note.document_name,
          get_url: null,
        });
        if (newDocId) setActiveTab(newDocId);
      } finally {
        removePendingTab(pendingId);
      }
    },
    [copyFromSession, sessionId, addPendingTab, removePendingTab]
  );

  // --- Render content ---
  const renderContent = () => {
    if (activeTab.startsWith('pending-processing-') && phase === SESSION_PHASE.PROCESSING)
      return <AnalysingStateDisplay />;

    if (phase === SESSION_PHASE.ERROR && !isContextTab) {
      const activeTabLabel = tabs.find((t) => t.id === activeTab)?.label;
      const { title, description } = getSessionErrorContent(sessionError, activeTabLabel);
      const isChunkLimit = sessionError?.code === 'chunk_limit_reached';
      return (
        <ErrorComponent
          title={title}
          variant={isChunkLimit ? 'warning' : 'error'}
          errors={[{ type: isChunkLimit ? 'warning' : 'error', msg: description }]}
        />
      );
    }

    if (uiLoading) return <SessionBodySkeleton />;

    if (isStreamTab) return null;

    if (isContextTab) {
      return (
        <ContextTabContent
          sessionId={sessionId}
          patientOid={patientOid}
          linkedSessions={sessionContext.linkedSessions}
          onRemoveLinkedSession={sessionContext.handleRemoveLinkedSession}
        />
      );
    }

    if (isTranscriptTab) {
      return <TranscriptTabContent sessionId={sessionId} />;
    }

    return null;
  };

  // --- Footer config ---
  const footerConfig = ((): TabFooterConfig | null => {
    if (phase === SESSION_PHASE.ERROR && !isContextTab) {
      if (sessionError?.code === 'chunk_limit_reached') {
        return getChunkLimitFooterConfig({
          onEndRecording: endRecording,
          onContinueRecording: handleContinueRecording,
          onDiscard: handleDiscard,
        });
      }
      return getErrorFooterConfig({
        onTryAgain: handleTryAgain,
        onDiscard: handleDiscard,
      });
    }

    if (isStreamTab) {
      const isDone = finishedStreamTabs.has(activeTab);
      const streamDocId = streamDocIds.get(activeTab) || streamRef.current?.getDocumentId() || '';
      return getDocumentFooterConfig({
        onCopy: async () => {
          const md = streamRef.current?.getMarkdown();
          if (md) await copyMarkdownToClipboard(md);
        },
        onPrint: async () => {
          const docId = streamDocIds.get(activeTab) || streamRef.current?.getDocumentId() || '';
          if (docId) await printDocument({ documentId: docId, sessionId });
        },
        onPublish: () => {
          const docId = streamDocIds.get(activeTab) || streamRef.current?.getDocumentId() || '';
          if (docId) handlePublish(docId);
        },
        saveStatus: isDone ? saveStatus : 'generating',
        copyDisabled: !isDone,
        printDisabled: !isDone || !streamDocId,
        publishDisabled: !isDone || !streamDocId,
      });
    }

    if (isContextTab) {
      const contextOverlay = sessionContext.showLinkDialog ? (
        <div className="absolute bottom-full left-2 mb-2 z-10">
          <LinkPastSessionsDialog
            patientName={selectedPatientDetails?.username || ''}
            sessions={sessionContext.patientSessions}
            loading={sessionContext.loadingPatientSessions}
            onClose={() => sessionContext.setShowLinkDialog(false)}
            onAddContext={sessionContext.handleAddLinkedSessions}
            alreadyLinkedIds={sessionContext.linkedSessions.map((s) => s.txn_id)}
          />
        </div>
      ) : undefined;

      return getContextFooterConfig({
        onLinkPastSessions: sessionContext.handleOpenLinkDialog,
        isPatientSelected: sessionContext.isPatientSelected,
        saveStatus,
        overlay: contextOverlay,
      });
    }

    if (isTranscriptTab && transcriptDocs.length > 0) {
      const existingLangs = new Set(transcriptDocs.map((t) => t.lang || 'raw'));
      const activeLang =
        selectedTranscriptLang && existingLangs.has(selectedTranscriptLang)
          ? selectedTranscriptLang
          : transcriptDocs[0]?.lang || 'raw';
      const activeTranscriptDoc =
        transcriptDocs.find((t) => (t.lang || 'raw') === activeLang) || transcriptDocs[0];
      return getTranscriptFooterConfig({
        onCopy: async () => {
          if (activeTranscriptDoc?.content) {
            await copyMarkdownToClipboard(activeTranscriptDoc.content);
          }
        },
        copyDisabled: !activeTranscriptDoc?.content,
      });
    }

    if (isDocumentTab && activeDoc) {
      const hasContent = activeDoc.content !== '' && (!!activeDoc.content || activeDoc.status === 'success');
      return getDocumentFooterConfig({
        onCopy: handleCopyDocument,
        onPrint: async () => {
          await printDocument({ documentId: activeDoc.document_id, sessionId });
        },
        onSendWhatsApp: hasWhatsApp
          ? () => {
              setWhatsappSendDoc({
                id: activeDoc.document_id,
                name: activeDoc.document_name || 'Prescription',
              });
              setWhatsappSendOpen(true);
            }
          : undefined,
        onSaveNote: () => handleSaveNote(activeDoc.document_id, activeDoc.document_name || 'Note'),
        onPublish: () => handlePublish(activeDoc.document_id),
        isNoteSaved: savedNotes.isNoteSaved(activeDoc.document_id),
        saveStatus,
        copyDisabled: !hasContent,
        printDisabled: !hasContent,
        whatsappDisabled: !hasContent,
      });
    }

    return null;
  })();

  // --- Warning overlay ---
  const showWarning =
    warningMessage &&
    (warningScreen === 'start_session' ||
      warningScreen === 'recording' ||
      warningScreen === 'template' ||
      warningScreen === 'output_summary');

  return (
    <div className="w-full px-4 flex flex-col flex-1 min-h-0">
      <div className="flex flex-col flex-1 min-h-0 bg-white border border-[#D1D1D1] border-b-0 rounded-t-xl overflow-hidden">
        <SessionTabRow
          tabs={tabs}
          activeTabId={activeTab}
          onTabChange={handleTabChange}
          showAddButton={phase !== SESSION_PHASE.PROCESSING && phase !== SESSION_PHASE.ERROR}
          onRenameTab={handleRenameTab}
          onDeleteTab={handleDeleteTab}
          addButtonLabel="Add or convert"
          disabledTabIds={limitGuard.isLimitExceeded ? ['context'] : undefined}
          onDisabledTabClick={limitGuard.disabledClickHandler}
          renderAddPopoverContent={(close) => (
            <AddOrConvertPopover
              onAddNote={() => {
                close();
                handleAddNote();
              }}
              onAddTranscript={
                onAddTranscript
                  ? () => {
                      close();
                      onAddTranscript();
                    }
                  : undefined
              }
              templates={userSelectedTemplatesList}
              onConvertTemplate={(template) => handleConvertTemplate(template, close)}
              onStreamTemplate={
                showConvertOption ? (template) => streamAgUiRun(template, close) : undefined
              }
              showConvertOption={showConvertOption}
              showGenerateTranscriptOption={phase === SESSION_PHASE.IDLE}
              sessionId={sessionId}
              patientOid={patientOid}
              onPickCopyNote={(note, session) => handlePickCopyNote(note, session, close)}
              savedNotes={savedNotes.notes}
              onPickSavedNote={(note) => handlePickSavedNote(note, close)}
            />
          )}
        />

        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col relative" data-print-content>
          {/* Stream tabs stay mounted so SSE connections survive tab switches */}
          {activeStreamTabs.map((tab) => {
            const templateId = tab.id.split(':')[1] ?? '';
            const isActive = activeTab === tab.id;
            return (
              <div key={tab.id} className={isActive ? 'flex flex-col flex-1 min-h-0' : 'hidden'}>
                <SessionDocument
                  ref={isActive ? streamRef : undefined}
                  mode="streaming"
                  sessionId={sessionId}
                  templateId={templateId}
                  streamKey={tab.id}
                  documentName={tab.label}
                  onFinished={({ success }) => { if (success) handleStreamFinished(tab.id); }}
                  onDocumentId={(docId: string) => handleStreamDocumentId(tab.id, docId)}
                />
              </div>
            );
          })}

          {/* Document tabs stay mounted so streaming survives tab switches */}
          {Array.from(mountedDocIdsRef.current).map((docId) => (
            <div key={docId} className={activeTab === docId ? 'flex flex-col flex-1 min-h-0' : 'hidden'}>
              <SessionDocument
                ref={activeTab === docId ? documentRef : undefined}
                mode="document"
                sessionId={sessionId}
                documentId={docId}
                hasTranscriptContent={hasTranscriptContent}
                autoStream={autoStreamDocId === docId}
              />
            </div>
          ))}

          {!isStreamTab && renderContent()}

          {showWarning && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 w-[316px]">
              <SessionAlert
                variant={
                  warningType === 'error'
                    ? 'destructive'
                    : warningType === 'success'
                      ? 'success'
                      : 'warning'
                }
                icon={
                  warningType === 'success' ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    <TriangleAlert className="w-4 h-4" />
                  )
                }
                title={warningMessage}
                description={warningListHeader}
                listItems={warningListItems}
                actionComponent={WarningAction ? <WarningAction /> : undefined}
                onClose={clearWarningInfo}
              />
            </div>
          )}
        </div>

        {footerConfig && <TabFooter config={footerConfig} sessionId={sessionId} />}
      </div>

      {whatsappSendOpen && whatsappSendDoc && (
        <WhatsAppSendDialog
          open={whatsappSendOpen}
          onOpenChange={setWhatsappSendOpen}
          patientName={selectedPatientDetails?.username || ''}
          patientMobile={selectedPatientDetails?.mobile}
          doctorName={`${loggedInUserDetails?.s || ''} ${loggedInUserDetails?.fn || ''} ${loggedInUserDetails?.ln || ''}`.trim()}
          sessionCreatedAt={useVoice2RxStore.getState().sessionV2ContentById[sessionId]?.created_at}
          documentId={whatsappSendDoc.id}
          sessionId={sessionId}
          fallbackDocumentName={whatsappSendDoc.name}
        />
      )}
    </div>
  );
};

export default SessionBody;
