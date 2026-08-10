'use client';

import dynamic from 'next/dynamic';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Loader2, MessageSquare, RefreshCw, TriangleAlert } from 'lucide-react';
import { Button } from '@ui/src';

import useVoice2RxStore from '@/store/store';
import { SessionBodySkeleton } from '@/app/new-session/loading';
import ErrorComponent from '../output/error-component';
import { TEMPLATE_WARNINGS_MSG } from '@/constants/enums';
import { useStreamEditor } from '../../ag-ui/hooks/use-stream-editor';
import { useDocumentEditor } from '../../hooks/document/use-document-editor';
import { useEditorFocus } from '../../hooks/document/use-editor-focus';
import { buildScribeEditorExtensions } from '../../ag-ui/editor/editor-extensions';
import type { StreamMessage, StreamPhase } from '../../ag-ui/types';

const WysiwygEditor = dynamic(() => import('../editor/tiptap-wysiwyg-editor'), {
  ssr: false,
});

// ─────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────

export type SessionDocumentHandle = {
  getDocumentId: () => string;
  getMarkdown: () => string;
  save: () => void;
};

type CommonProps = {
  sessionId: string;
};

type StreamingProps = CommonProps & {
  mode: 'streaming';
  templateId: string;
  streamKey: string;
  documentName?: string;
  onFinished?: (result: { success: boolean; json?: import('@tiptap/core').JSONContent }) => void;
  onDocumentId?: (documentId: string) => void;
  documentId?: string;
};

type DocumentProps = CommonProps & {
  mode: 'document';
  documentId: string;
  hasTranscriptContent?: boolean;
  autoStream?: boolean;
};

export type SessionDocumentProps = StreamingProps | DocumentProps;

export const SessionDocument = forwardRef<SessionDocumentHandle, SessionDocumentProps>(
  function SessionDocument(props, ref) {
    if (props.mode === 'streaming') {
      return <StreamingDocument ref={ref} {...props} />;
    }
    return <DocumentView ref={ref} {...props} />;
  }
);

// ─────────────────────────────────────────────────────────────────────────
// Streaming mode — wraps useStreamEditor, renders streaming UI + editor
// ─────────────────────────────────────────────────────────────────────────

const StreamingDocument = forwardRef<SessionDocumentHandle, StreamingProps>(
  function StreamingDocument(
    { sessionId, templateId, streamKey, documentName, onFinished, onDocumentId, documentId },
    ref
  ) {
    const {
      state,
      messages,
      toolCalls,
      phase,
      error,
      editorRef,
      initialJSON,
      handleChange,
      handleBlur,
      saveDocument,
      getMarkdown,
    } = useStreamEditor({ sessionId, templateId, streamKey, onFinished, onDocumentId, documentId });

    const { editorWrapperRef, handleFocusChange } = useEditorFocus(editorRef);

    useImperativeHandle(
      ref,
      () => ({
        getDocumentId: () => state.document_id,
        getMarkdown,
        save: saveDocument,
      }),
      [state, saveDocument, getMarkdown]
    );

    const favouriteNote = useMemo(
      () =>
        state.document_id
          ? { documentId: state.document_id, documentName: documentName || 'Note' }
          : undefined,
      [state.document_id, documentName]
    );

    const hasSections = state.sections.length > 0;
    const hasStreamContent = hasSections || messages.length > 0 || toolCalls.length > 0;
    const isStreaming = phase === 'streaming' || phase === 'connecting';
    // Only show the "Note is generating" placeholder while a run is genuinely in
    // flight. An empty doc that's idle/finished shows nothing instead of looking
    // like it's still generating.
    const isLoading = !hasStreamContent && isStreaming;

    // Auto-scroll during streaming
    const bottomRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
      if (isStreaming) {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    }, [state.sections.length, messages.length, toolCalls.length, isStreaming]);

    return (
      <div className="flex-1 min-h-0 h-full flex flex-col">
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="flex flex-col px-4 pt-4 pb-4 gap-3">
            {!isLoading && (
              <StreamStatusBanner
                phase={phase}
                error={error}
                pendingToolCallId={state.pending_tool_call_id ?? null}
              />
            )}

            {isLoading && <BlankState documentName={documentName} />}

            {messages.length > 0 && <AgentMessages messages={messages} />}

            <div
              ref={editorWrapperRef}
              className={`${isStreaming ? '[&_.scribe-editor]:min-h-0' : ''}`}
            >
              <WysiwygEditor
                ref={editorRef}
                initialJSON={initialJSON}
                customExtensions={buildScribeEditorExtensions()}
                editable={phase === 'finished'}
                showToolbar={phase === 'finished'}
                favouriteNote={favouriteNote}
                onChange={handleChange}
                onBlur={handleBlur}
                onFocusChange={handleFocusChange}
                placeholder=""
              />
            </div>

            {isStreaming && !isLoading && <StreamingIndicator />}

            {state.omitted_sections.length > 0 && phase === 'finished' && (
              <div className="text-xs text-[#9CA3AF] italic mt-2">
                Skipped (no transcript signal): {state.omitted_sections.join(', ')}
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        </div>
      </div>
    );
  }
);

// ─────────────────────────────────────────────────────────────────────────
// Document mode — loads saved JSON/markdown, renders editor
// ─────────────────────────────────────────────────────────────────────────

// Persists across tab switches (component remounts) so we don't re-trigger
// auto-streaming for documents that already produced no content.
const autoStreamAttempted = new Set<string>();

const DocumentView = forwardRef<SessionDocumentHandle, DocumentProps>(function DocumentView(
  { sessionId, documentId, hasTranscriptContent, autoStream },
  ref
) {
  const [regenerating, setRegenerating] = useState(false);
  const streamKeyRef = useRef('');
  const autoStreamKeyRef = useRef('');
  const autoStreamTriggered = useRef(false);

  const {
    doc,
    loaderState,
    setDocumentContent,
    editorRef,
    initialJSON,
    initialValue,
    handleChange,
    handleBlur,
    saveDocument,
    getMarkdown,
  } = useDocumentEditor({ sessionId, documentId });

  const { editorWrapperRef, handleFocusChange } = useEditorFocus(editorRef);

  const isDocumentEmpty = useMemo(
    () =>
      loaderState.status === 'empty' ||
      (loaderState.status === 'ready' &&
        loaderState.source === 'markdown' &&
        !loaderState.initialValue?.trim()),
    [loaderState]
  );

  const isCustomDoc = doc?.document_type === 'custom';

  const canRetry =
    isCustomDoc && !!doc?.template_id && !!doc?.document_id && !!hasTranscriptContent && !regenerating;

  const handleRetry = useCallback(() => {
    streamKeyRef.current = `regen:${documentId}:${Date.now()}`;
    setRegenerating(true);
  }, [documentId]);

  useImperativeHandle(
    ref,
    () => ({
      getDocumentId: () => documentId,
      getMarkdown,
      save: () => {
        saveDocument();
      },
    }),
    [documentId, getMarkdown, saveDocument]
  );

  const favouriteNote = useMemo(
    () => ({ documentId, documentName: doc?.document_name || 'Note' }),
    [documentId, doc?.document_name]
  );

  // Auto-stream in-progress custom docs when triggered by end-recording flow
  useEffect(() => {
    if (
      autoStream &&
      !autoStreamTriggered.current &&
      !regenerating &&
      isCustomDoc &&
      doc?.status === 'in-progress' &&
      isDocumentEmpty &&
      !!doc.template_id &&
      loaderState.status !== 'loading'
    ) {
      autoStreamTriggered.current = true;
      streamKeyRef.current = `auto-regen:${documentId}:${Date.now()}`;
      setRegenerating(true);
    }
  }, [autoStream, regenerating, isCustomDoc, doc?.status, isDocumentEmpty, doc?.template_id, documentId, loaderState.status]);

  // Doc metadata status branches
  if (!doc) return <SessionBodySkeleton />;

  if (regenerating) {
    return (
      <StreamingDocument
        ref={ref}
        mode="streaming"
        sessionId={sessionId}
        templateId={doc.template_id}
        streamKey={streamKeyRef.current}
        documentName={doc.document_name}
        documentId={doc.document_id}
        onFinished={({ success, json }) => {
          setRegenerating(false);
          if (success) {
            useVoice2RxStore.getState().setSessionV2Document(sessionId, documentId, { status: 'success' });
            if (json) setDocumentContent(json);
          }
        }}
      />
    );
  }

  if (doc.status === 'failure') {
    return (
      <div className="flex flex-col h-full px-4 pt-4">
        {canRetry && (
          <div className="flex justify-end">
            <Button
              className="gap-2 cursor-pointer text-white border-0 hover:opacity-90"
              style={{ background: 'linear-gradient(to right, #56c9a8, #4685c0)' }}
              onClick={handleRetry}
            >
              <RefreshCw className="w-4 h-4" />
              Retry generating
            </Button>
          </div>
        )}
        <div className="flex items-center justify-center flex-1">
          <ErrorComponent
            title={`Error Generating ${doc.document_name || 'Content'}`}
            variant="error"
            errors={doc.errors.map((e) => ({
              type: 'error' as const,
              msg: e.message || e.code,
            }))}
          />
        </div>
      </div>
    );
  }

  // Content loader branches
  if (loaderState.status === 'loading') return <SessionBodySkeleton />;

  if (loaderState.status === 'error') {
    return (
      <div className="flex items-center justify-center h-full px-4 pt-4">
        <ErrorComponent
          title={`Error Generating ${doc.document_name || 'Content'}`}
          variant="error"
          errors={[{ type: 'error' as const, msg: loaderState.error }]}
        />
      </div>
    );
  }

  if (isCustomDoc && doc.status === 'in-progress' && isDocumentEmpty) {
    return (
      <div className="flex flex-col h-full">
        {canRetry && (
          <div className="flex justify-end p-4">
            <Button
              className="gap-2 cursor-pointer text-white border-0 hover:opacity-90"
              style={{ background: 'linear-gradient(to right, #56c9a8, #4685c0)' }}
              onClick={handleRetry}
            >
              <RefreshCw className="w-4 h-4" />
              Resume generating
            </Button>
          </div>
        )}
        <div className="flex items-center justify-center flex-1 px-4">
          <ErrorComponent
            title="Document generation was interrupted"
            variant="in-progress"
            description="Click 'Resume generating' to continue."
          />
        </div>
      </div>
    );
  }

  // Success custom document with no content — auto-start streaming (once per document)
  const autoStreamNeeded = isCustomDoc && doc.status === 'success' && isDocumentEmpty && !!doc.template_id && !regenerating && !autoStreamAttempted.has(documentId);
  if (autoStreamNeeded && !autoStreamKeyRef.current) {
    autoStreamKeyRef.current = `auto:${documentId}:${Date.now()}`;
  }
  if (autoStreamNeeded) {
    return (
      <StreamingDocument
        ref={ref}
        mode="streaming"
        sessionId={sessionId}
        templateId={doc.template_id}
        streamKey={autoStreamKeyRef.current}
        documentName={doc.document_name}
        documentId={doc.document_id}
        onFinished={({ success, json }) => {
          autoStreamAttempted.add(documentId);
          if (success) {
            useVoice2RxStore.getState().setSessionV2Document(sessionId, documentId, { status: 'success' });
            if (json) setDocumentContent(json);
          }
        }}
      />
    );
  }

  if (doc?.document_type === 'custom' && isDocumentEmpty) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <div className="flex items-center gap-2 rounded-md border border-[#FCD34D] bg-[#FEF8E1] text-[#92400E] px-3 py-2 text-sm">
          <TriangleAlert className="w-4 h-4 shrink-0" />
          {TEMPLATE_WARNINGS_MSG.NO_MEDICAL_CONTEXT}
        </div>
        {canRetry && (
          <div className="flex justify-end">
            <Button
              className="gap-2 cursor-pointer text-white border-0 hover:opacity-90"
              style={{ background: 'linear-gradient(to right, #56c9a8, #4685c0)' }}
              onClick={handleRetry}
            >
              <RefreshCw className="w-4 h-4" />
              Retry generating
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 h-full flex flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-2">
        <div ref={editorWrapperRef}>
          <WysiwygEditor
            key={documentId}
            ref={editorRef}
            initialJSON={initialJSON}
            initialValue={initialValue}
            customExtensions={buildScribeEditorExtensions()}
            editable={true}
            showToolbar={true}
            favouriteNote={favouriteNote}
            onChange={handleChange}
            onBlur={handleBlur}
            onFocusChange={handleFocusChange}
          />
        </div>
      </div>
    </div>
  );
});

// ─────────────────────────────────────────────────────────────────────────
// Local UI helpers
// ─────────────────────────────────────────────────────────────────────────

function BlankState({ documentName }: { documentName?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-[140px]">
      <div className="w-12 h-12 rounded-full bg-[#eff6ff] border border-[#d6e4ff] flex items-center justify-center mb-4">
        <div className="w-[18px] h-[18px] border-2 border-[#d6e4ff] border-t-[#2563eb] rounded-full animate-spin" />
      </div>
      <h3 className="text-[17px] font-semibold text-[#0b1220] mb-1.5">
        {documentName || 'Note'} is generating
      </h3>
      <p className="text-[13.5px] text-[#64748b] max-w-[360px] text-center">
        It will render here once the session transcript is processed.
      </p>
    </div>
  );
}

function StreamingIndicator() {
  return (
    <div className="flex items-center gap-1.5">
      <span className="stream-caret" />
      <span className="inline-flex items-center gap-[3px]">
        {[0, 0.15, 0.3].map((delay) => (
          <span
            key={delay}
            className="w-1.5 h-1.5 rounded-full bg-[#64748b]"
            style={{ animation: `thinking-bob 1.2s ease-in-out infinite ${delay}s` }}
          />
        ))}
      </span>
    </div>
  );
}

function StreamStatusBanner({
  phase,
  error,
  pendingToolCallId,
}: {
  phase: StreamPhase;
  error: string | null;
  pendingToolCallId: string | null;
}) {
  if (phase === 'error') {
    return (
      <div className="rounded-md border border-[#FECACA] bg-[#FEF2F2] text-[#991B1B] px-3 py-2 text-sm">
        {error || 'Streaming failed.'}
      </div>
    );
  }
  if (pendingToolCallId) {
    return (
      <div className="rounded-md border border-[#FCD34D] bg-[#FEF3C7] text-[#92400E] px-3 py-2 text-xs">
        Awaiting user input for tool call <code className="font-mono">{pendingToolCallId}</code>
      </div>
    );
  }
  return null;
}

function AgentMessages({ messages }: { messages: StreamMessage[] }) {
  return (
    <div className="flex flex-col gap-2">
      {messages.map((m) => (
        <div key={m.id} className="border border-[#E5E7EB] rounded-lg bg-[#F9FAFB] p-3">
          <div className="flex items-center gap-2 mb-1 text-[11px] uppercase tracking-wide text-[#6B7280]">
            <MessageSquare className="w-3 h-3" />
            <span>{m.role}</span>
            {!m.done && <Loader2 className="w-3 h-3 animate-spin text-[#215FFF]" />}
          </div>
          <div className="text-sm text-[#191919] whitespace-pre-wrap break-words">
            {m.content || (!m.done ? '…' : '')}
          </div>
        </div>
      ))}
    </div>
  );
}
