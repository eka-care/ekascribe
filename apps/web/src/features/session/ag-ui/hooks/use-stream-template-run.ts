'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { v4 as uuidv4 } from 'uuid';

import { streamAgUiRun, type AgUiEvent } from '../ag-ui-stream';
import { applyPatch, applySnapshot, EMPTY_SCRIBE_STATE } from '../state-reducer';
import type { ScribeState, StreamMessage, StreamPhase, StreamToolCall } from '../types';
import { tracker } from '@/analytics';

type Args = {
  sessionId: string;
  templateId: string;
  /**
   * Auto-start when the component mounts. Defaults to true; pass false
   * if the caller wants to control start/stop manually.
   */
  autoStart?: boolean;

  /** Unique key for this tab instance (the full `stream:templateId:timestamp` tab id). */
  streamKey: string;

  /** Optional document ID passed as query param for regeneration. */
  documentId?: string;
};
type CachedRun = {
  state: ScribeState;
  messages: StreamMessage[];
  toolCalls: StreamToolCall[];
  phase: StreamPhase;
  error: string | null;
};

const runCache = new Map<string, CachedRun>();

export function clearStreamCache(key: string) {
  runCache.delete(key);
}

type Result = {
  state: ScribeState;
  messages: StreamMessage[];
  toolCalls: StreamToolCall[];
  phase: StreamPhase;
  error: string | null;
  runId: string;
  start: () => void;
  abort: () => void;
};

/**
 * Drive one AG-UI scribe run for (sessionId, templateId).
 *
 * Maintains:
 *  - `state`     — ScribeState rebuilt from STATE_SNAPSHOT/STATE_DELTA
 *  - `messages`  — TEXT_MESSAGE_* accumulated by message_id
 *  - `toolCalls` — TOOL_CALL_* accumulated by tool_call_id
 *
 * Phase transitions: idle → connecting → streaming → finished | error.
 * Aborting transitions to 'finished' (we treat user-cancel and successful
 * end the same — neither needs an error toast).
 */
export function useStreamTemplateRun({
  sessionId,
  templateId,
  streamKey,
  autoStart = true,
  documentId,
}: Args): Result {
  const cached = runCache.get(streamKey);

  const [state, setState] = useState<ScribeState>(
    () =>
      cached?.state ?? {
        ...EMPTY_SCRIBE_STATE,
        txn_id: sessionId,
        template_id: templateId,
      }
  );
  const [messages, setMessages] = useState<StreamMessage[]>(() => cached?.messages ?? []);
  const [toolCalls, setToolCalls] = useState<StreamToolCall[]>(() => cached?.toolCalls ?? []);
  const [phase, setPhase] = useState<StreamPhase>(() => cached?.phase ?? 'idle');
  const [error, setError] = useState<string | null>(() => cached?.error ?? null);
  const [runId, setRunId] = useState<string>(() => uuidv4());

  const abortRef = useRef<AbortController | null>(null);
  // Generation counter: every start() bumps it. Async work captures the
  // generation at the time it was scheduled and only mutates state if
  // it's still the latest. This replaces the older runningRef boolean,
  // which raced under React StrictMode's mount → cleanup → mount cycle:
  // the second mount could see runningRef === true (because the first
  // run's IIFE finally hadn't run yet) and bail out, leaving the SSE
  // request unopened. The generation approach has no such guard to
  // contend with — stale runs just no-op when they resolve.
  const genRef = useRef(0);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const start = useCallback(() => {
    const gen = ++genRef.current;
    // Cancel any in-flight previous run; its IIFE will see the stale
    // generation and exit without touching state.
    abortRef.current?.abort();

    // Clear stale cached data so a fresh run never inherits previous
    // markdown or state from an earlier run with the same streamKey.
    runCache.delete(streamKey);

    const controller = new AbortController();
    abortRef.current = controller;
    const localRunId = uuidv4();
    setRunId(localRunId);
    setPhase('connecting');
    setError(null);
    tracker.log({
      name: 'agui_streaming_started',
      properties: { session_id: sessionId, template_id: templateId },
    });
    setMessages([]);
    setToolCalls([]);
    setState({
      ...EMPTY_SCRIBE_STATE,
      txn_id: sessionId,
      template_id: templateId,
    });

    (async () => {
      const isStale = () => genRef.current !== gen;
      try {
        const events = streamAgUiRun({
          templateId,
          input: {
            thread_id: sessionId,
            run_id: localRunId,
            state: {},
            messages: [],
            tools: [],
            context: [],
            forwarded_props: {},
          },
          signal: controller.signal,
          documentId,
        });

        for await (const ev of events as AsyncGenerator<AgUiEvent>) {
          if (isStale()) return;
          handleEvent(ev, {
            setState,
            setMessages,
            setToolCalls,
            setPhase,
            setError,
          });
          if (ev.type === 'RUN_ERROR' || ev.type === 'RUN_FINISHED') break;
        }

        if (isStale()) return;
        // If the stream closed without an explicit terminal frame and
        // we're still in connecting/streaming, treat the closed stream
        // as a finish.
        setPhase((prev) => (prev === 'streaming' || prev === 'connecting' ? 'finished' : prev));
      } catch (e) {
        if (isStale()) return;
        if (controller.signal.aborted) {
          setPhase('finished');
        } else {
          tracker.error(e, {
            domain: 'processing',
            component: 'agui_streaming',
            extra: { session_id: sessionId, template_id: templateId },
          });
          setError(e instanceof Error ? e.message : String(e));
          setPhase('error');
        }
      }
    })();
  }, [sessionId, templateId, streamKey, documentId]);

  // Keep cache in sync on every state change so unmount always has latest data
  useEffect(() => {
    runCache.set(streamKey, { state, messages, toolCalls, phase, error });
  }, [phase, streamKey, state, messages, toolCalls, error]);

  // On unmount: mark as finished so remount won't restart the SSE and
  // create a duplicate document. React 18 silently drops setState calls
  // on unmounted components, so the setPhase('finished') in the catch
  // block never reaches the cache effect — we must update runCache directly.
  useEffect(() => {
    return () => {
      const cached = runCache.get(streamKey);
      if (cached && cached.phase !== 'finished' && cached.phase !== 'error') {
        runCache.set(streamKey, { ...cached, phase: 'finished' });
      }
    };
  }, [streamKey]);

  useEffect(() => {
    const cached = runCache.get(streamKey);
    const alreadyDone = cached?.phase === 'finished' || cached?.phase === 'error';
    if (autoStart && !alreadyDone) start();
    return () => abort();
  }, [autoStart, start, abort, streamKey]);

  return { state, messages, toolCalls, phase, error, runId, start, abort };
}

type HandleEventCtx = {
  setState: Dispatch<SetStateAction<ScribeState>>;
  setMessages: Dispatch<SetStateAction<StreamMessage[]>>;
  setToolCalls: Dispatch<SetStateAction<StreamToolCall[]>>;
  setPhase: Dispatch<SetStateAction<StreamPhase>>;
  setError: Dispatch<SetStateAction<string | null>>;
};

function handleEvent(ev: AgUiEvent, ctx: HandleEventCtx) {
  const { setState, setMessages, setToolCalls, setPhase, setError } = ctx;
  switch (ev.type) {
    case 'RUN_STARTED':
      setPhase('streaming');
      break;
    case 'STATE_SNAPSHOT':
      setState(applySnapshot((ev as { snapshot: unknown }).snapshot));
      break;
    case 'STATE_DELTA': {
      const ops = (ev as { delta?: unknown }).delta;
      if (Array.isArray(ops)) setState((prev) => applyPatch(prev, ops));
      break;
    }
    case 'MESSAGES_SNAPSHOT': {
      // Some BEs emit a full message list snapshot. Replace local
      // messages wholesale so we stay in sync with the canonical view.
      const ms = (ev as { messages?: unknown }).messages;
      if (Array.isArray(ms)) {
        setMessages(
          ms.map((m) => {
            const obj = (m ?? {}) as Record<string, unknown>;
            return {
              id: String(obj.id ?? ''),
              role: typeof obj.role === 'string' ? obj.role : 'assistant',
              content: typeof obj.content === 'string' ? obj.content : '',
              done: true,
            };
          })
        );
      }
      break;
    }
    case 'TEXT_MESSAGE_START': {
      const id = (ev as { message_id: string }).message_id;
      const role = (ev as { role?: string }).role ?? 'assistant';
      setMessages((prev) =>
        prev.some((m) => m.id === id) ? prev : [...prev, { id, role, content: '', done: false }]
      );
      break;
    }
    case 'TEXT_MESSAGE_CONTENT': {
      const id = (ev as { message_id: string }).message_id;
      const delta = (ev as { delta?: string }).delta ?? '';
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === id);
        if (idx === -1) {
          return [...prev, { id, role: 'assistant', content: delta, done: false }];
        }
        const next = prev.slice();
        next[idx] = { ...next[idx], content: next[idx].content + delta };
        return next;
      });
      break;
    }
    case 'TEXT_MESSAGE_END': {
      const id = (ev as { message_id: string }).message_id;
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, done: true } : m)));
      break;
    }
    case 'TOOL_CALL_START': {
      const id = (ev as { tool_call_id: string }).tool_call_id;
      const name = (ev as { tool_call_name?: string }).tool_call_name ?? '';
      const parent = (ev as { parent_message_id?: string }).parent_message_id;
      setToolCalls((prev) =>
        prev.some((t) => t.id === id)
          ? prev
          : [
              ...prev,
              {
                id,
                name,
                args: '',
                parent_message_id: parent,
                status: 'streaming',
              },
            ]
      );
      break;
    }
    // case 'TOOL_CALL_ARGS': {
    //   const id = (ev as { tool_call_id: string }).tool_call_id;
    //   const delta = (ev as { delta?: string }).delta ?? '';
    //   setToolCalls((prev) => {
    //     const idx = prev.findIndex((t) => t.id === id);
    //     if (idx === -1) {
    //       return [...prev, { id, name: '', args: delta, status: 'streaming' }];
    //     }
    //     const next = prev.slice();
    //     next[idx] = { ...next[idx], args: next[idx].args + delta };
    //     return next;
    //   });
    //   break;
    // }
    case 'TOOL_CALL_END': {
      const id = (ev as { tool_call_id: string }).tool_call_id;
      setToolCalls((prev) =>
        prev.map((t) => (t.id === id && t.status === 'streaming' ? { ...t, status: 'ended' } : t))
      );
      break;
    }
    case 'TOOL_CALL_RESULT': {
      const id = (ev as { tool_call_id: string }).tool_call_id;
      const content = (ev as { content?: string }).content ?? '';
      setToolCalls((prev) => {
        const idx = prev.findIndex((t) => t.id === id);
        if (idx === -1) {
          return [...prev, { id, name: '', args: '', result: content, status: 'completed' }];
        }
        const next = prev.slice();
        next[idx] = { ...next[idx], result: content, status: 'completed' };
        return next;
      });
      break;
    }
    case 'RUN_ERROR':
      setError((ev as { message?: string }).message ?? 'Stream error');
      setPhase('error');
      break;
    case 'RUN_FINISHED':
      setPhase('finished');
      break;
    default:
      // Unknown events — log so future BE-added event types surface in
      // dev, but don't break the stream.
      if (typeof console !== 'undefined') {
        console.debug('[ag-ui] unhandled event', ev.type, ev);
      }
      break;
  }
}
