'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

import { streamDocumentChat, type AgUiEvent, type JsonPatchOp, type ChatHistoryMessage } from '../ag-ui-stream';

export type ChatTurn = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  done: boolean;
};

export type ChatPhase = 'idle' | 'streaming' | 'error';

type Args = {
  sessionId: string;
  documentId: string;
  /** Reads the current editor markdown — sent as the chat's source of truth. */
  getCurrentMarkdown: () => string;
  /** Apply an edited markdown back into the editor (view only). */
  onMarkdownUpdate: (markdown: string) => void;
  /** Called once after a turn that actually edited the note (to persist). */
  onComplete?: () => void;
};

type Result = {
  turns: ChatTurn[];
  phase: ChatPhase;
  error: string | null;
  streaming: boolean;
  send: (text: string) => void;
  abort: () => void;
};

function markdownFromSnapshot(snapshot: unknown): string | null {
  if (snapshot && typeof snapshot === 'object' && 'document_markdown' in snapshot) {
    const value = (snapshot as { document_markdown?: unknown }).document_markdown;
    return typeof value === 'string' ? value : null;
  }
  return null;
}

function markdownFromDelta(ops: JsonPatchOp[]): string | null {
  let markdown: string | null = null;
  for (const op of ops) {
    if (op.path === '/document_markdown' && (op.op === 'replace' || op.op === 'add')) {
      if (typeof op.value === 'string') markdown = op.value;
    }
  }
  return markdown;
}

/**
 * Drive the per-document chat: Q&A + section edits over a scribe note.
 *
 * The note is markdown end-to-end (Path C): the backend owns all section
 * splicing and streams the full updated markdown back via STATE_DELTA /
 * STATE_SNAPSHOT; this hook just relays it to `onMarkdownUpdate` and
 * accumulates the assistant's text reply.
 */
export function useDocumentChat({
  sessionId,
  documentId,
  getCurrentMarkdown,
  onMarkdownUpdate,
  onComplete,
}: Args): Result {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [phase, setPhase] = useState<ChatPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  // Abort any in-flight chat stream if the tab unmounts.
  useEffect(() => () => abortRef.current?.abort(), []);

  const send = useCallback(
    (rawText: string) => {
      const text = rawText.trim();
      if (!text || phase === 'streaming' || !documentId) return;

      const history: ChatHistoryMessage[] = turns
        .filter((t) => t.done && t.content.trim())
        .map((t) => ({ role: t.role, content: t.content }));

      const assistantId = uuidv4();
      setTurns((prev) => [
        ...prev,
        { id: uuidv4(), role: 'user', content: text, done: true },
        { id: assistantId, role: 'assistant', content: '', done: false },
      ]);
      setError(null);
      setPhase('streaming');

      const sentMarkdown = getCurrentMarkdown();
      let lastApplied = sentMarkdown;
      let edited = false;
      let sawToolCall = false;

      const appendAssistant = (delta: string) =>
        setTurns((prev) =>
          prev.map((t) => (t.id === assistantId ? { ...t, content: t.content + delta } : t))
        );
      const finishAssistant = () =>
        setTurns((prev) => prev.map((t) => (t.id === assistantId ? { ...t, done: true } : t)));

      const applyMarkdown = (markdown: string | null) => {
        if (markdown == null || markdown === lastApplied) return;
        lastApplied = markdown;
        edited = true;
        onMarkdownUpdate(markdown);
      };

      const controller = new AbortController();
      abortRef.current = controller;
      const runId = uuidv4();

      (async () => {
        try {
          const events = streamDocumentChat({
            documentId,
            input: {
              thread_id: sessionId,
              run_id: runId,
              message: text,
              document_markdown: sentMarkdown,
              history,
            },
            signal: controller.signal,
          });

          for await (const ev of events as AsyncGenerator<AgUiEvent>) {
            if (ev.type === 'RUN_ERROR') {
              setError((ev as { message?: string }).message ?? 'Chat failed');
              finishAssistant();
              setPhase('error');
              return;
            }

            if (ev.type === 'RUN_FINISHED') break;

            // Track tool calls so we can separate pre-tool and post-tool text
            if (ev.type === 'TOOL_CALL_START') sawToolCall = true;

            // Insert a newline when text resumes after tool execution
            if (
              (ev.type === 'TEXT_MESSAGE_CHUNK' || ev.type === 'TEXT_MESSAGE_CONTENT') &&
              sawToolCall
            ) {
              appendAssistant('\n');
              sawToolCall = false;
            }

            handleChatEvent(ev, { appendAssistant, applyMarkdown });
          }

          finishAssistant();
          setPhase('idle');
          if (edited) onComplete?.();
        } catch (e) {
          if (controller.signal.aborted) {
            finishAssistant();
            setPhase('idle');
            return;
          }
          setError(e instanceof Error ? e.message : String(e));
          finishAssistant();
          setPhase('error');
        }
      })();
    },
    [phase, turns, documentId, sessionId, getCurrentMarkdown, onMarkdownUpdate, onComplete]
  );

  return { turns, phase, error, streaming: phase === 'streaming', send, abort };
}

function handleChatEvent(
  ev: AgUiEvent,
  ctx: { appendAssistant: (delta: string) => void; applyMarkdown: (md: string | null) => void }
) {
  switch (ev.type) {
    // Backend streams answer text as TEXT_MESSAGE_CHUNK; tolerate the
    // START/CONTENT/END variant too.
    case 'TEXT_MESSAGE_CHUNK':
    case 'TEXT_MESSAGE_CONTENT': {
      const delta = (ev as { delta?: string }).delta ?? '';
      if (delta) ctx.appendAssistant(delta);
      break;
    }
    case 'STATE_SNAPSHOT':
      ctx.applyMarkdown(markdownFromSnapshot((ev as { snapshot?: unknown }).snapshot));
      break;
    case 'STATE_DELTA': {
      const ops = (ev as { delta?: unknown }).delta;
      if (Array.isArray(ops)) ctx.applyMarkdown(markdownFromDelta(ops as JsonPatchOp[]));
      break;
    }
    default:
      break;
  }
}
