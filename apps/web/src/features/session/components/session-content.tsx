'use client';

import { useMemo } from 'react';
import { TriangleAlert, CheckCircle2 } from 'lucide-react';
import useVoice2RxStore from '@/store/store';
import SessionAlert from '@/features/session/utils/session-alert';
import { SessionBodySkeleton } from '@/app/new-session/loading';
import AnalysingStateDisplay from './output/analysing-component';
import ErrorComponent, { getSessionErrorContent } from './output/error-component';
import { ContextTabContent } from './tabs/context-tab-content';
import { TranscriptTabContent } from './tabs/transcript-tab-content';
import { SessionDocument, type SessionDocumentHandle } from './tabs/session-document';
import { useSessionView } from '../hooks/use-session-view';
import { SESSION_PHASE } from '@/constants/enums';
import type { TSessionTab } from './session-tab-row';
import type { ContextTabContentHandle } from './tabs/context-tab-content';

const EMPTY_TRANSCRIPT: never[] = [];

interface SessionContentProps {
  sessionId: string;
  activeTab: string;
  tabs: TSessionTab[];
  activeStreamTabs: TSessionTab[];
  mountedDocIds: Set<string>;
  autoStreamDocId: string | null;
  onStreamFinished: (tabId: string) => void;
  onStreamDocumentId: (tabId: string, docId: string) => void;
  streamRef: React.RefObject<SessionDocumentHandle | null>;
  documentRef: React.RefObject<SessionDocumentHandle | null>;
  contextRef: React.RefObject<ContextTabContentHandle | null>;
}

const SessionContent = ({
  sessionId,
  activeTab,
  tabs,
  activeStreamTabs,
  mountedDocIds,
  autoStreamDocId,
  onStreamFinished,
  onStreamDocumentId,
  streamRef,
  documentRef,
  contextRef,
}: SessionContentProps) => {
  const { phase, error: sessionError, uiLoading } = useSessionView(sessionId);

  const transcriptDocs = useVoice2RxStore(
    (s) => s.sessionV2ContentById[sessionId]?.transcript ?? EMPTY_TRANSCRIPT
  );
  const warningMessage = useVoice2RxStore((s) => s.warningMessage);
  const warningType = useVoice2RxStore((s) => s.warningType);
  const warningScreen = useVoice2RxStore((s) => s.warningScreen);
  const warningListHeader = useVoice2RxStore((s) => s.warningListHeader);
  const warningListItems = useVoice2RxStore((s) => s.warningListItems);
  const WarningAction = useVoice2RxStore((s) => s.warningAction);
  const clearWarningInfo = useVoice2RxStore((s) => s.clearWarningInfo);

  const isContextTab = activeTab === 'context';
  const isTranscriptTab = activeTab === 'transcript';
  const isStreamTab = activeTab.startsWith('stream:');

  // Phase-level flags — at most one is true, checked in priority order
  const showAnalysing =
    !isStreamTab &&
    activeTab.startsWith('pending-processing-') &&
    phase === SESSION_PHASE.PROCESSING;
  const showPhaseError =
    !isStreamTab && !showAnalysing && phase === SESSION_PHASE.ERROR && !isContextTab;
  const showLoading = !isStreamTab && !showAnalysing && !showPhaseError && uiLoading;
  const showTabContent = !showAnalysing && !showPhaseError && !showLoading;

  const hasTranscriptContent = useMemo(
    () => transcriptDocs.some((t) => t.status === 'success'),
    [transcriptDocs]
  );

  const showWarning =
    warningMessage &&
    (warningScreen === 'start_session' ||
      warningScreen === 'recording' ||
      warningScreen === 'template' ||
      warningScreen === 'output_summary');

  return (
    <div className="flex-1 min-h-0 overflow-y-auto flex flex-col relative" data-print-content>
      {/* Context tab — conditional mount, unmounts on tab switch */}
      {isContextTab && (
        <div className="flex flex-col flex-1 min-h-0">
          <ContextTabContent ref={contextRef} sessionId={sessionId} />
        </div>
      )}

      {/* Stream tabs — live AG-UI SSE sessions, persistent mount to keep connection alive */}
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
              onFinished={({ success }) => {
                if (success) onStreamFinished(tab.id);
              }}
              onDocumentId={(docId: string) => onStreamDocumentId(tab.id, docId)}
            />
          </div>
        );
      })}

      {/* Document tabs — saved backend docs, persistent mount to preserve editor state */}
      {Array.from(mountedDocIds).map((docId) => (
        <div
          key={docId}
          className={activeTab === docId ? 'flex flex-col flex-1 min-h-0' : 'hidden'}
        >
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

      {/* Transcript tab — conditional mount, only when phase overlays aren't showing */}
      {isTranscriptTab && showTabContent && <TranscriptTabContent sessionId={sessionId} />}

      {/* Phase overlay — "Analysing" spinner during processing */}
      {showAnalysing && <AnalysingStateDisplay />}

      {/* Phase overlay — error state with retry/discard options */}
      {showPhaseError &&
        (() => {
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
        })()}

      {/* Phase overlay — skeleton loader while UI is initializing */}
      {showLoading && <SessionBodySkeleton />}

      {/* Warning toast — floating alert for recording/session warnings */}
      {showWarning && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 w-79">
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
  );
};

export default SessionContent;
