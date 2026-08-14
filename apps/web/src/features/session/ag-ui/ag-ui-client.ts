/**
 * SSE consumer for the AG-UI scribe template-run endpoint.
 *
 * Template run — POST {EKA_HOST}/voice/v1/scribe/agent/runs/{template_id}
 * Body: RunAgentInput (AG-UI core); thread_id == session_id.
 *
 * Returns text/event-stream — a sequence of AG-UI BaseEvents.
 *
 * We consume via fetch + ReadableStream because:
 *  - native EventSource can't POST or set custom headers
 *  - auth is cookie-based (`credentials: 'include'`) and must match
 *    the rest of the app's fetchWrapper pattern
 *
 * Event shape on the wire (default AG-UI encoder):
 *   data: {"type":"STATE_DELTA","delta":[...JSON Patch...]}\n\n
 */

import { GET_AUTH_TOKEN, GET_CLIENT_ID, GET_EKA_HOST } from '@/fetch-client/helper';

// ─────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────

export type TAgUiSnapshot = {
  template_id: string;
  txn_id: string;
  document_id: string;
  transcript: string;
  sections: unknown[];
  pending_tool_call_id: string | null;
};

export type AgUiEvent =
  | { type: 'RUN_STARTED'; thread_id: string; run_id: string }
  | { type: 'RUN_FINISHED'; thread_id: string; run_id: string }
  | { type: 'RUN_ERROR'; message: string; code?: string }
  | { type: 'STATE_SNAPSHOT'; snapshot: TAgUiSnapshot }
  | { type: 'STATE_DELTA'; delta: JsonPatchOp[] }
  | { type: 'TEXT_MESSAGE_START'; message_id: string; role?: string }
  | { type: 'TEXT_MESSAGE_CONTENT'; message_id: string; delta: string }
  | { type: 'TEXT_MESSAGE_END'; message_id: string }
  | {
      type: 'TOOL_CALL_START';
      tool_call_id: string;
      tool_call_name: string;
      parent_message_id?: string;
    }
  | { type: 'TOOL_CALL_ARGS'; tool_call_id: string; delta: string }
  | { type: 'TOOL_CALL_END'; tool_call_id: string }
  | { type: 'TOOL_CALL_RESULT'; tool_call_id: string; content: string; role?: string }
  | { type: string; [k: string]: unknown };

export type JsonPatchOp = {
  op: 'add' | 'replace' | 'remove' | 'move' | 'copy' | 'test';
  path: string;
  value?: unknown;
  from?: string;
};

export type RunAgentInput = {
  thread_id: string;
  run_id: string;
  state?: Record<string, unknown>;
  messages?: unknown[];
  tools?: unknown[];
  context?: unknown[];
  forwarded_props?: Record<string, unknown>;
};

export type StartRunOptions = {
  templateId: string;
  input: RunAgentInput;
  signal?: AbortSignal;
  documentId?: string;
  /** Structuring model id. Omitted => the backend uses its env default. */
  model?: string;
};

// ─────────────────────────────────────────────────────────────────────────
// Shared SSE transport
// ─────────────────────────────────────────────────────────────────────────

async function* streamSseEvents(
  url: string,
  body: unknown,
  signal: AbortSignal | undefined,
  errorPrefix: string
): AsyncGenerator<AgUiEvent, void, void> {
  const authToken = GET_AUTH_TOKEN();

  const response = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      'client-id': GET_CLIENT_ID(),
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      'x-protocol': 'ag-ui',
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

      // SSE frames are separated by a blank line. Pull complete frames
      // out of the buffer, leave any partial tail for the next chunk.
      let idx = buffer.indexOf('\n\n');
      while (idx !== -1) {
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const event = parseSseFrame(frame);
        if (event) yield event;
        idx = buffer.indexOf('\n\n');
      }
    }
    // Flush trailing decoder state and parse anything still in the buffer.
    // Some backends close the stream without a final blank line; without
    // this drain the last event (often RUN_FINISHED) would be dropped.
    buffer += decoder.decode();
    if (buffer.trim()) {
      const event = parseSseFrame(buffer);
      if (event) yield event;
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Parse a single SSE frame. We only care about the `data:` payload
 * (AG-UI doesn't use named events on this transport).
 */
function parseSseFrame(frame: string): AgUiEvent | null {
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
    return JSON.parse(payload) as AgUiEvent;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Public stream functions
// ─────────────────────────────────────────────────────────────────────────

const RUN_URL_PATH = '/voice/v1/scribe/agent/runs';
/**
 * Open the AG-UI template-run stream and yield decoded events.
 *
 * Throws on non-2xx open. The caller should treat thrown errors and
 * `RUN_ERROR` events the same way (they end the run); we don't merge
 * them here so callers can distinguish "never started" from "errored
 * mid-stream" if they want.
 */
export async function* streamAgUiRun({
  templateId,
  input,
  signal,
  documentId,
  model,
}: StartRunOptions): AsyncGenerator<AgUiEvent, void, void> {
  // TODO: change this URL after gateway changes
  let url = `${GET_EKA_HOST()}${RUN_URL_PATH}/${encodeURIComponent(templateId)}`;

  const params = new URLSearchParams();
  if (documentId) params.set('document_id', documentId);
  if (model) params.set('model', model);
  const query = params.toString();
  if (query) url += `?${query}`;

  yield* streamSseEvents(url, input, signal, 'AG-UI run failed');
}

