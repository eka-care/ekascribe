'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import useVoice2RxStore from '@/store/store';
import { with401Retry } from '@/fetch-client/api-with-retry';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@ui/src/shadcn-ui/lib/utils';
import { TRANSCRIPTION_LANGUAGES } from '@/constants/settings';
import { SessionBodySkeleton } from '@/app/new-session/loading';
import ErrorComponent from '@/features/session/components/output/error-component';
// import { ChunkTranscriptDisplay } from '../recording/chunk-transcript-display';
import * as sdkService from '../../services/sdk-service';
import * as documentService from '../../services/document-service';
import { pollAndLoadSessionDetails } from '../../services/session-loader';
import { SESSION_PHASE } from '@/constants/enums';
import type { NormalizedDocument } from '../../types';
import TranscriptIdleState from '../recording/transcript-idle-state';
// import { useChunkTranscription } from '../../hooks/recording/use-chunk-transcription';

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
  const selectedLang = useVoice2RxStore(
    (s) => s.sessionV2ContentById[sessionId]?.ui?.selected_transcript_lang || ''
  );
  const transcriptLoading = useVoice2RxStore(
    (s) => s.sessionV2ContentById[sessionId]?.ui?.transcript_loading ?? EMPTY_TRANSCRIPT_LOADING
  );

  const isProcessing = phase === SESSION_PHASE.PROCESSING;

  // Poll for chunk transcripts during recording
  // useChunkTranscription({ sessionId, enabled: isRecording });

  // Languages that already have a transcript doc (untranslated transcript → 'raw')
  const existingLangs = useMemo(() => {
    return new Set(transcriptDocs.map((t) => t.lang || 'raw'));
  }, [transcriptDocs]);

  const languagesWithOutputStatus = useMemo(() => {
    return TRANSCRIPTION_LANGUAGES.map((lang) => {
      const apiLang = lang.id;
      return { ...lang, hasOutputData: existingLangs.has(apiLang) };
    });
  }, [existingLangs]);

  // Resolve active language
  const activeLang =
    transcriptDocs.length > 0 && selectedLang && existingLangs.has(selectedLang)
      ? selectedLang
      : transcriptDocs[0]?.lang || 'raw';

  const activeDoc = useMemo(
    () => transcriptDocs.find((t) => (t.lang || 'raw') === activeLang),
    [transcriptDocs, activeLang]
  );
  const hasError = activeDoc?.status === 'failure';

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

  const handleLanguageChange = useCallback(
    async (value: string) => {
      const apiLang = value;

      useVoice2RxStore.getState().setSessionV2Ui(sessionId, {
        selected_transcript_lang: apiLang,
      });

      // If transcript already exists, just fetch its content
      if (existingLangs.has(apiLang)) {
        const doc = transcriptDocs.find((t) => (t.lang || 'raw') === apiLang);
        if (doc && doc.content === null) {
          loadLangContent(sessionId, apiLang, doc);
        }
        return;
      }

      // Convert to new language
      useVoice2RxStore.getState().setTranscriptLangLoading(sessionId, apiLang, true);

      try {
        const response = await with401Retry(
          () =>
            sdkService.convertTranscriptionToTemplate({
              txn_id: sessionId,
              target_language: value,
            }),
          `convert transcription to ${value}`
        );

        if (response.status_code >= 400 || response.status === 'failed') {
          console.error('Failed to convert transcription:', response.error);
          return;
        }

        // Wait for backend to finish generating, then reload session details
        const result = await pollAndLoadSessionDetails(sessionId);

        if (result === 'failed') {
          useVoice2RxStore.getState().setWarningInfo({
            screen: 'template',
            message: 'Translation is taking longer than expected. Please try again.',
          });
          return;
        }

        // Fetch content for the new transcript doc (store was updated by pollAndLoadSessionDetails)
        const updatedTranscripts =
          useVoice2RxStore.getState().sessionV2ContentById[sessionId]?.transcript || [];
        const newDoc = updatedTranscripts.find((t) => (t.lang || 'raw') === apiLang);
        if (newDoc) {
          await fetchTranscriptContent(sessionId, newDoc);
        }
      } catch (error) {
        console.error('Error converting transcription:', error);
        useVoice2RxStore.getState().setWarningInfo({
          screen: 'template',
          message: 'Failed to translate transcription. Please try again.',
        });
      } finally {
        useVoice2RxStore.getState().setTranscriptLangLoading(sessionId, apiLang, false);
      }
    },
    [sessionId, existingLangs, transcriptDocs]
  );

  // During recording, show live chunk transcripts
  // if (isRecording) {
  //   return <ChunkTranscriptDisplay sessionId={sessionId} />;
  // }

  // During processing, keep showing chunk transcription until final transcript arrives
  // if (isProcessing) {
  //   if (!(transcriptDocs.length > 0 && transcriptDocs[0].content !== null)) {
  //     return <ChunkTranscriptDisplay sessionId={sessionId} />;
  //   }
  // }

  // Show idle state when no recording has happened yet (user_status is init)
  if (phase === SESSION_PHASE.IDLE) {
    return <TranscriptIdleState />;
  }

  if (phase === SESSION_PHASE.RECORDING) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <div className="flex flex-col items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
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

  // The language shown in the dropdown. While a brand-new language is generating it
  // doesn't have a doc yet, so fall back to the selected lang to keep it on screen.
  const displayLang = selectedLang && !existingLangs.has(selectedLang) ? selectedLang : activeLang;
  const isDisplayLoading = !!transcriptLoading[displayLang];

  return (
    <div className="flex flex-col h-full w-full gap-4 pt-3">
      <div className="px-4">
        <div className="flex items-center gap-8 bg-[#F5F5F5] rounded-lg p-2 w-fit">
          <span className="text-sm font-medium text-[#1A1A1A] w-28 shrink-0">Output language</span>
          <Select value={displayLang} onValueChange={handleLanguageChange} disabled={hasError}>
            <SelectTrigger
              className={cn('w-41.75 border-[#D1D1D1] shadow-sm bg-white rounded-lg h-8 text-sm')}
            >
              <SelectValue placeholder="Select a language" />
            </SelectTrigger>
            <SelectContent className="border-[#D1D1D1]">
              {languagesWithOutputStatus.map((lang) => {
                const isLoadingThis = !!transcriptLoading[lang.id];
                const showIcon = lang.hasOutputData || isLoadingThis;
                return (
                  <SelectItem key={lang.id} value={lang.id}>
                    <div className="flex items-center gap-2">
                      {isLoadingThis ? (
                        <Loader2 className="w-3 h-3 animate-spin text-[#767676] shrink-0" />
                      ) : lang.hasOutputData ? (
                        <div className="w-2 h-2 rounded-full bg-green-10 shrink-0" />
                      ) : null}
                      <span className={`truncate ${showIcon ? 'font-semibold' : 'pl-4'}`}>
                        {lang.name}
                      </span>
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex-1 overflow-auto pb-4">
        {isDisplayLoading ? (
          <SessionBodySkeleton />
        ) : activeDoc?.status === 'failure' ? (
          <div className="px-4">
            <ErrorComponent
              title="Error Generating Transcript"
              variant="error"
              errors={activeDoc.errors.map((e) => ({
                type: 'error' as const,
                msg: e.message || e.code,
              }))}
            />
          </div>
        ) : activeDoc ? (
          <div className="px-4 text-sm text-secondary-foreground whitespace-pre-wrap">
            {activeDoc.content}
          </div>
        ) : null}
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
