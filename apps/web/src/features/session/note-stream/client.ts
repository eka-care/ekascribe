/**
 * SSE consumer for the markdown note-run endpoint (post-AG-UI).
 *
 * POST {EKA_HOST}/voice/v1/scribe/agent/runs/{template_id}
 *      ?session_id=…&document_id=…&template_model=…
 *
 * The stream is plain JSON frames:
 *   data: {"type":"start","run_id":…,"document_id":…}
 *   data: {"type":"delta","text":"…"}            (repeated)
 *   data: {"type":"done","markdown":"…","document_id":…,"replay":true?}
 *   data: {"type":"error","message":"…"}
 *
 * fetch + ReadableStream (not EventSource): we need POST, custom headers,
 * and cookie credentials, matching the app's fetchWrapper pattern.
 */

import { GET_AUTH_TOKEN, GET_CLIENT_ID, GET_EKA_HOST } from '@/fetch-client/helper';

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

export type NoteStreamFrame =
  | { type: 'start'; run_id: string; document_id: string }
  | { type: 'delta'; text: string }
  | { type: 'done'; markdown: string; document_id: string; replay?: boolean }
  | { type: 'error'; message: string };

export type StartNoteRunOptions = {
  templateId: string;
  sessionId: string;
  signal?: AbortSignal;
  documentId?: string;
  /** Structuring model id. Omitted => the backend uses its env default. */
  model?: string;
};

export type ChatTurnOptions = {
  documentId: string;
  threadId: string;
  runId: string;
  message: string;
  documentMarkdown: string;
  history?: { role: 'user' | 'assistant'; content: string }[];
  signal?: AbortSignal;
};

// ─────────────────────────────────────────────────────────────────────────
// Shared SSE transport
// ─────────────────────────────────────────────────────────────────────────

async function* streamSseFrames(
  url: string,
  body: unknown,
  signal: AbortSignal | undefined,
  errorPrefix: string
): AsyncGenerator<NoteStreamFrame, void, void> {
  const authToken = GET_AUTH_TOKEN();

  const response = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      'client-id': GET_CLIENT_ID(),
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`${errorPrefix}: ${response.status} ${response.statusText} ${text}`);
  }
  if (!response.body) {
    throw new Error(`${errorPrefix}: response has no body`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by a blank line; keep the partial tail.
      let idx = buffer.indexOf('\n\n');
      while (idx !== -1) {
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const parsed = parseSseFrame(frame);
        if (parsed) yield parsed;
        idx = buffer.indexOf('\n\n');
      }
    }
    // Drain: some backends close without a final blank line.
    buffer += decoder.decode();
    if (buffer.trim()) {
      const parsed = parseSseFrame(buffer);
      if (parsed) yield parsed;
    }
  } finally {
    reader.releaseLock();
  }
}

function parseSseFrame(frame: string): NoteStreamFrame | null {
  const dataLines: string[] = [];
  for (const rawLine of frame.split('\n')) {
    const line = rawLine.startsWith('\r') ? rawLine.slice(1) : rawLine;
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart());
    }
  }
  if (dataLines.length === 0) return null;
  const payload = dataLines.join('\n');
  if (!payload) return null;
  try {
    return JSON.parse(payload) as NoteStreamFrame;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Public stream functions
// ─────────────────────────────────────────────────────────────────────────

const RUN_URL_PATH = '/voice/v1/scribe/agent/runs';
const CHAT_URL_PATH = '/voice/v1/scribe/agent/documents';

/** Open the note-run stream and yield frames. Throws on non-2xx open. */
export async function* streamNoteRun({
  templateId,
  sessionId,
  signal,
  documentId,
  model,
}: StartNoteRunOptions): AsyncGenerator<NoteStreamFrame, void, void> {
  let url = `${GET_EKA_HOST()}${RUN_URL_PATH}/${encodeURIComponent(templateId)}`;

  const params = new URLSearchParams();
  params.set('session_id', sessionId);
  if (documentId) params.set('document_id', documentId);
  if (model) params.set('template_model', model);
  url += `?${params.toString()}`;

  yield* streamSseFrames(url, {}, signal, 'Note run failed');
}

/** One document-chat turn: streams the complete revised markdown. */
export async function* streamChatTurn({
  documentId,
  threadId,
  runId,
  message,
  documentMarkdown,
  history = [],
  signal,
}: ChatTurnOptions): AsyncGenerator<NoteStreamFrame, void, void> {
  const url = `${GET_EKA_HOST()}${CHAT_URL_PATH}/${encodeURIComponent(documentId)}/chat`;
  yield* streamSseFrames(
    url,
    {
      thread_id: threadId,
      run_id: runId,
      message,
      document_markdown: documentMarkdown,
      history,
    },
    signal,
    'Document chat failed'
  );
}
