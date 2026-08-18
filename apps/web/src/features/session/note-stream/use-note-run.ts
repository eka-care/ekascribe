'use client';

/**
 * Drive one markdown note run for (sessionId, templateId).
 *
 * Replaces the AG-UI useAgentRun/useStreamEditor pair: the run is a plain
 * SSE stream of markdown deltas — no tool calls, no state patches. The
 * accumulated markdown is the entire state.
 *
 * Phase transitions: idle → connecting → streaming → finished | error.
 * Aborting transitions to 'finished' (user-cancel and successful end are
 * treated the same — neither needs an error toast). The backend persists
 * the finished note itself, so a re-run with the same documentId replays
 * instantly instead of re-invoking the LLM.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

import { streamNoteRun } from './client';
import { tracker } from '@/analytics';
import useVoice2RxStore from '@/store/store';

export type NotePhase = 'idle' | 'connecting' | 'streaming' | 'finished' | 'error';

type CachedRun = {
  markdown: string;
  documentId: string;
  phase: NotePhase;
  error: string | null;
};

const runCache = new Map<string, CachedRun>();

// Post-stream editor content, keyed by streamKey — survives tab-switch
// unmount/remount so the editor can re-hydrate locally without a fetch.
const markdownCache = new Map<string, string>();

export function clearStreamCache(key: string) {
  runCache.delete(key);
}
export const getStreamMarkdownCache = (key: string) =>
  markdownCache.get(key) ?? runCache.get(key)?.markdown;
export const setStreamMarkdownCache = (key: string, markdown: string) => {
  if (markdown) markdownCache.set(key, markdown);
};
export const clearStreamMarkdownCache = (key: string) => {
  markdownCache.delete(key);
  runCache.delete(key);
};

type Args = {
  sessionId: string;
  templateId: string;
  /** Unique key for this tab instance (`stream:templateId:timestamp`). */
  streamKey: string;
  /** Auto-start on mount (default true). */
  autoStart?: boolean;
  /** Optional document ID passed as query param for regeneration/replay. */
  documentId?: string;
};

type Result = {
  markdown: string;
  documentId: string;
  phase: NotePhase;
  error: string | null;
  runId: string;
  start: () => void;
  abort: () => void;
};

export function useNoteRun({
  sessionId,
  templateId,
  streamKey,
  autoStart = true,
  documentId,
}: Args): Result {
  const cached = runCache.get(streamKey);

  const [markdown, setMarkdown] = useState<string>(() => cached?.markdown ?? '');
  const [docId, setDocId] = useState<string>(() => cached?.documentId ?? documentId ?? '');
  const [phase, setPhase] = useState<NotePhase>(() => cached?.phase ?? 'idle');
  const [error, setError] = useState<string | null>(() => cached?.error ?? null);
  const [runId, setRunId] = useState<string>(() => uuidv4());

  const abortRef = useRef<AbortController | null>(null);
  // Generation counter: every start() bumps it; stale async work no-ops.
  // (Same StrictMode-safe pattern the AG-UI hook used.)
  const genRef = useRef(0);

  // Model chosen in the header selector — read through a ref so `start`
  // stays referentially stable while seeing the latest pick.
  const structuringModel = useVoice2RxStore((s) => s.structuringModel);
  const modelRef = useRef(structuringModel);
  modelRef.current = structuringModel;

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const start = useCallback(() => {
    const gen = ++genRef.current;
    abortRef.current?.abort();
    runCache.delete(streamKey);
    markdownCache.delete(streamKey);

    const controller = new AbortController();
    abortRef.current = controller;
    const localRunId = uuidv4();
    setRunId(localRunId);
    setPhase('connecting');
    setError(null);
    setMarkdown('');
    const streamStartMs = Date.now();
    tracker.log({
      name: 'note_streaming_started',
      properties: { session_id: sessionId, template_id: templateId },
    });

    (async () => {
      const isStale = () => genRef.current !== gen;
      try {
        const frames = streamNoteRun({
          templateId,
          sessionId,
          signal: controller.signal,
          documentId,
          model: modelRef.current ?? undefined,
        });

        let acc = '';
        for await (const frame of frames) {
          if (isStale()) return;
          if (frame.type === 'start') {
            setPhase('streaming');
            if (frame.document_id) setDocId(frame.document_id);
          } else if (frame.type === 'delta') {
            acc += frame.text;
            setMarkdown(acc);
          } else if (frame.type === 'done') {
            acc = frame.markdown || acc;
            setMarkdown(acc);
            if (frame.document_id) setDocId(frame.document_id);
            setPhase('finished');
            break;
          } else if (frame.type === 'error') {
            setError(frame.message || 'Stream error');
            setPhase('error');
            break;
          }
        }

        if (isStale()) return;
        tracker.log({
          name: 'note_streaming_completed',
          properties: {
            session_id: sessionId,
            template_id: templateId,
            duration_ms: Date.now() - streamStartMs,
          },
        });
        // Stream closed with no terminal frame → treat as finished.
        setPhase((prev) => (prev === 'streaming' || prev === 'connecting' ? 'finished' : prev));
      } catch (e) {
        if (isStale()) return;
        if (controller.signal.aborted) {
          setPhase('finished');
        } else {
          tracker.error(e, {
            domain: 'processing',
            component: 'note_streaming',
            extra: {
              session_id: sessionId,
              template_id: templateId,
              duration_ms: Date.now() - streamStartMs,
            },
          });
          setError(e instanceof Error ? e.message : String(e));
          setPhase('error');
        }
      }
    })();
  }, [sessionId, templateId, streamKey, documentId]);

  // Keep the cache current so unmount/remount re-hydrates locally.
  useEffect(() => {
    runCache.set(streamKey, { markdown, documentId: docId, phase, error });
  }, [streamKey, markdown, docId, phase, error]);

  // On unmount mid-stream: mark finished so a remount won't re-run and
  // create a duplicate document (React drops setState after unmount, so
  // the cache must be written directly).
  useEffect(() => {
    return () => {
      const c = runCache.get(streamKey);
      if (c && c.phase !== 'finished' && c.phase !== 'error') {
        runCache.set(streamKey, { ...c, phase: 'finished' });
      }
    };
  }, [streamKey]);

  useEffect(() => {
    const c = runCache.get(streamKey);
    const alreadyDone = c?.phase === 'finished' || c?.phase === 'error';
    if (autoStart && !alreadyDone) start();
    return () => abort();
  }, [autoStart, start, abort, streamKey]);

  return { markdown, documentId: docId, phase, error, runId, start, abort };
}
