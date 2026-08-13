'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, RotateCcw } from 'lucide-react';
import useVoice2RxStore from '@/store/store';
import { with401Retry } from '@/fetch-client/api-with-retry';
import { DelayedSessionBodySkeleton } from '@/app/new-session/loading';
import ErrorComponent from '@/features/session/components/output/error-component';
import * as sdkService from '../../services/sdk-service';
import * as documentService from '../../services/document-service';
import { pollAndLoadSessionDetails } from '../../services/session-loader';
import { SESSION_PHASE } from '@/constants/enums';
import type { NormalizedDocument } from '../../types';
import TranscriptIdleState from '../recording/transcript-idle-state';

interface TranscriptTabContentProps {
  sessionId: string;
}

const EMPTY_TRANSCRIPT: never[] = [];
const EMPTY_TRANSCRIPT_LOADING: Record<string, boolean> = {};

export function TranscriptTabContent({ sessionId }: TranscriptTabContentProps) {
  const phase = useVoice2RxStore(
    (s) => s.sessionV2ContentById[sessionId]?.phase || SESSION_PHASE.IDLE
  );
  const transcriptDocs = useVoice2RxStore(
    (s) => s.sessionV2ContentById[sessionId]?.transcript ?? EMPTY_TRANSCRIPT
  );
  const transcriptLoading = useVoice2RxStore(
    (s) => s.sessionV2ContentById[sessionId]?.ui?.transcript_loading ?? EMPTY_TRANSCRIPT_LOADING
  );
  const userStatus = useVoice2RxStore((s) => s.sessionV2ContentById[sessionId]?.user_status || '');

  const [isRetrying, setIsRetrying] = useState(false);

  const isProcessing = phase === SESSION_PHASE.PROCESSING;

  const activeLang = transcriptDocs[0]?.lang || 'raw';
  const activeDoc = useMemo(
    () => transcriptDocs.find((t) => (t.lang || 'raw') === activeLang),
    [transcriptDocs, activeLang]
  );

  // Fetch transcript content on mount / when active doc changes
  useEffect(() => {
    if (!activeDoc?.document_id || activeDoc.content !== null) return;
    const alreadyLoading =
      useVoice2RxStore.getState().sessionV2ContentById[sessionId]?.ui?.transcript_loading?.[
        activeLang
      ];
    if (alreadyLoading) return;

    loadLangContent(sessionId, activeLang, activeDoc);
  }, [activeDoc, activeLang, sessionId]);

  const handleRetry = async () => {
    if (isRetrying) return;
    setIsRetrying(true);
    try {
      const response = await with401Retry(
        () => sdkService.recommitSession(sessionId),
        'recommit session'
      );
      if (response.status_code >= 400) {
        useVoice2RxStore.getState().setWarningInfo({
          screen: 'recording',
          message: 'Could not restart transcription. Please try again.',
        });
        return;
      }
      // Show the "Generating transcript" state while the pipeline re-runs.
      useVoice2RxStore.getState().setSessionV2Content(sessionId, {
        phase: SESSION_PHASE.PROCESSING,
      });
      const result = await pollAndLoadSessionDetails(sessionId);
      if (result === 'failed') {
        useVoice2RxStore.getState().setWarningInfo({
          screen: 'recording',
          message: 'Transcription is taking longer than expected. Please check back shortly.',
        });
      }
    } catch (error) {
      console.error('Error recommitting session:', error);
      useVoice2RxStore.getState().setWarningInfo({
        screen: 'recording',
        message: 'Could not restart transcription. Please try again.',
      });
    } finally {
      setIsRetrying(false);
    }
  };

  // Show idle state when no recording has happened yet (user_status is init)
  if (phase === SESSION_PHASE.IDLE) {
    return <TranscriptIdleState />;
  }

  if (phase === SESSION_PHASE.RECORDING) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <div className="flex flex-col items-center gap-4">
          <img src="/assets/mic-recording.svg" alt="" width={100} height={100} />
          <div className="flex flex-col items-center gap-2 text-center">
            <p className="text-2xl font-medium leading-none tracking-[-0.6px] text-foreground w-82.5">
              Recording in progress
            </p>
            <p className="text-sm leading-5 text-[#999] w-52.5">
              The transcript will be ready once you end the session
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (phase === SESSION_PHASE.PAUSED) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <div className="flex flex-col items-center gap-4">
          <img src="/assets/mic-paused.svg" alt="" width={100} height={100} />
          <div className="flex flex-col items-center gap-2 text-center">
            <p className="text-2xl font-medium leading-none tracking-[-0.6px] text-foreground w-82.5">
              Recording paused
            </p>
            <p className="text-sm leading-5 text-[#999] min-h-10">
              Resume when you&apos;re ready to continue
            </p>
          </div>
        </div>
      </div>
    );
  }

  // While processing, keep an in-progress state until the transcript content is ready.
  if (isProcessing && !activeDoc?.content) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <div className="flex flex-col items-center gap-4">
          <div className="w-25 h-25 flex items-center justify-center">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
          </div>
          <div className="flex flex-col items-center gap-2 text-center">
            <p className="text-2xl font-medium leading-none tracking-[-0.6px] text-foreground w-82.5">
              Generating transcript
            </p>
            <p className="text-sm leading-5 text-[#999] min-h-10">
              Your transcript will appear here soon
            </p>
          </div>
        </div>
      </div>
    );
  }

  const isLoading = !!transcriptLoading[activeLang];
  const hasContent = !!activeDoc?.content?.trim();

  if (isLoading) {
    return (
      <div className="pt-3">
        <DelayedSessionBodySkeleton />
      </div>
    );
  }

  if (activeDoc?.status === 'failure') {
    return (
      <div className="px-4 pt-3">
        <ErrorComponent
          title="Error Generating Transcript"
          variant="error"
          errors={activeDoc.errors.map((e) => ({
            type: 'error' as const,
            msg: e.message || e.code,
          }))}
        />
      </div>
    );
  }

  // Session finished but no transcript came back — neutral state, not an error.
  if (!hasContent) {
    return (
      <ErrorComponent
        title="No transcription available"
        description="This session's recording didn't produce a transcript"
        variant="warning"
        action={
          // Recommit only helps when audio was recorded but never committed
          userStatus === 'recording_started' ? (
            <button
              onClick={handleRetry}
              disabled={isRetrying}
              className="flex items-center gap-2 h-9 px-4 rounded-lg bg-white border border-[#D1D1D1] text-sm font-medium text-foreground cursor-pointer hover:bg-[#F5F5F5] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isRetrying ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RotateCcw className="w-4 h-4" />
              )}
              Retry transcription
            </button>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="flex flex-col h-full w-full gap-4 pt-3">
      <div className="flex-1 overflow-auto pb-4">
        <div className="px-4 text-sm text-secondary-foreground whitespace-pre-wrap">
          {activeDoc?.content}
        </div>
      </div>
    </div>
  );
}

async function fetchTranscriptContent(sessionId: string, doc: NormalizedDocument) {
  const content = await documentService.fetchDocumentContent(
    sessionId,
    doc.document_id,
    doc.get_url,
    true
  );
  if (content !== null) {
    useVoice2RxStore.getState().setSessionV2Document(sessionId, doc.document_id, { content });
  }
}

async function loadLangContent(sessionId: string, lang: string, doc: NormalizedDocument) {
  useVoice2RxStore.getState().setTranscriptLangLoading(sessionId, lang, true);
  try {
    await fetchTranscriptContent(sessionId, doc);
  } finally {
    useVoice2RxStore.getState().setTranscriptLangLoading(sessionId, lang, false);
  }
}
