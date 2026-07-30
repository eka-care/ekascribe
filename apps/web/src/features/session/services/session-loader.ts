import useVoice2RxStore from '@/store/store';
import { with401Retry } from '@/fetch-client/api-with-retry';
import { SESSION_PHASE } from '@/constants/enums';
import type { NormalizedDocument, SessionV2Phase } from '../types';
import { normalizeDocuments } from '../utils/normalize-documents';
import { resolveSessionPreferences, TRawSessionConfig } from '../utils/resolve-session-preferences';
import { normalizePatientDetails, TRawPatientDetails } from '@/utils/shared-helpers';
import * as sdkService from './sdk-service';

function preserveCachedContent(
  fresh: NormalizedDocument[],
  cached: NormalizedDocument[] | undefined
) {
  if (!cached?.length) return;

  const byId = new Map(cached.map((d) => [d.document_id, d]));
  for (let i = 0; i < fresh.length; i++) {
    const prev = byId.get(fresh[i].document_id);
    if (!prev) continue;
    if (!fresh[i].content && prev.content) {
      fresh[i] = { ...fresh[i], content: prev.content };
    }
    const newPub = (fresh[i].publish?.emr_webhook as { status?: string } | undefined)?.status;
    const oldPub = (prev.publish?.emr_webhook as { status?: string } | undefined)?.status;
    if (!newPub && oldPub) {
      fresh[i] = { ...fresh[i], publish: prev.publish };
    }
  }
}

const POLL_INTERVAL_MS = 2_000;
const POLL_MAX_TIMEOUT_MS = 60_000; // 1 minute
const POLL_MAX_BACKOFF_MS = 10_000;

let pollingAbortController: AbortController | null = null;

/** Abort any in-flight polling. Safe to call even when nothing is polling. */
export function abortPolling() {
  pollingAbortController?.abort();
  pollingAbortController = null;
}

/**
 * Fetch session details and update the store (ongoing + content).
 * Optionally override the resolved phase.
 * Returns the backend `status` field (e.g. 'processed'), or null if unavailable.
 */
export async function loadSessionDetails(
  sessionId: string,
  forcePhase?: SessionV2Phase
): Promise<string | null> {
  const store = useVoice2RxStore.getState();

  const response = await with401Retry(
    () => sdkService.getSessionDetails(sessionId, true, 'v2'),
    'get session details'
  );

  if (!response.data) return null;

  const {
    documents: rawDocs,
    user_status,
    audio_matrix,
    created_at,
    upload_url,
    expires_at,
    additional_data,
    patient_details: rawPatient,
    context: sessionContext,
    status: processingStatus,
  } = response.data;

  const { context, transcript, documents } = normalizeDocuments(rawDocs || []);

  // TODO: add this in response type
  // The authoritative session config lives in top-level response fields (not additional_data).
  const rawConfig = response.data as TRawSessionConfig;

  const session_config = resolveSessionPreferences(rawConfig, {
    supportedLanguages: store.appConfig.supported_languages,
    documents: rawDocs || [],
  });

  const phase: SessionV2Phase =
    forcePhase ??
    (user_status === 'recording_started'
      ? SESSION_PHASE.OUTPUT
      : user_status === 'init'
      ? SESSION_PHASE.IDLE
      : SESSION_PHASE.OUTPUT);

  const patientDetails = normalizePatientDetails(
    rawPatient as TRawPatientDetails | null | undefined
  );

  // Preserve cached content/publish so revisiting a session doesn't flash a skeleton.
  const existing = store.sessionV2ContentById[sessionId];
  if (existing) {
    preserveCachedContent(documents, existing.documents);
    preserveCachedContent(transcript, existing.transcript);
    preserveCachedContent(context, existing.context);
  }

  store.setSessionV2Content(sessionId, {
    phase,
    patient_details: patientDetails,
    audio_matrix: audio_matrix?.quality ? { quality: String(audio_matrix.quality) } : null,
    created_at: created_at ? String(created_at) : '',
    upload_url: (upload_url as Record<string, unknown>) || {},
    expires_at: expires_at ? String(expires_at) : '',
    additional_data: additional_data || {},
    session_config,
    session_context: sessionContext || {},
    user_status: user_status || '',
    context,
    transcript,
    documents,
  });

  return processingStatus ?? null;
}

// Most recent session's id, or null when there's no history (or on error).
export async function fetchLatestSessionId(): Promise<string | null> {
  try {
    const response = await with401Retry(
      () => sdkService.getSessionHistory({ txn_count: 1 }),
      'get latest session'
    );

    if (response.status_code === 200 && response.data && response.data.length > 0) {
      return response.data[0]?.txn_id ?? null;
    }

    return null;
  } catch {
    return null;
  }
}

const POLL_DONE_STATUS_CODES = new Set([200, 206]);

// Polls getSessionStatus until 200/206 (done) or timeout. Returns status or null.
async function pollSessionStatus(
  sessionId: string,
  signal: AbortSignal,
  templateId?: string
): Promise<string | null> {
  const deadline = Date.now() + POLL_MAX_TIMEOUT_MS;
  let networkBackoff = POLL_INTERVAL_MS;

  while (Date.now() < deadline) {
    if (signal.aborted) return null;

    let delay = POLL_INTERVAL_MS;

    try {
      const result = await with401Retry(
        () => sdkService.getSessionStatus(sessionId, templateId, 'v2'),
        'get session status'
      );

      networkBackoff = POLL_INTERVAL_MS;

      if (result.success && result.httpStatus && POLL_DONE_STATUS_CODES.has(result.httpStatus)) {
        return result.data.status;
      }
    } catch {
      delay = networkBackoff;
      networkBackoff = Math.min(networkBackoff * 2, POLL_MAX_BACKOFF_MS);
    }

    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, delay);
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true }
      );
    });
  }

  return null;
}

// 'success' = confirmed or processed; 'failed' = genuine failure.
export type PollAndLoadResult = 'success' | 'failed';

export async function pollAndLoadSessionDetails(
  sessionId: string,
  forcePhase?: SessionV2Phase,
  { transcriptFirst = false }: { transcriptFirst?: boolean } = {}
): Promise<PollAndLoadResult> {
  pollingAbortController = new AbortController();
  const { signal } = pollingAbortController;

  const status = await pollSessionStatus(
    sessionId,
    signal,
    transcriptFirst ? 'transcript' : undefined
  );
  pollingAbortController = null;

  if (signal.aborted) return 'failed';

  if (!status || status === 'failed' || status === 'expired') {
    let apiStatus: string | null = null;
    try {
      apiStatus = await loadSessionDetails(sessionId);
    } catch {
      // best-effort
    }
    return apiStatus === 'processed' ? 'success' : 'failed';
  }

  await loadSessionDetails(sessionId, forcePhase);
  return 'success';
}

// Non-blocking poll for upload-transcript / upload-audio flows. Sets error phase on failure.
export function pollSessionInBackground(sessionId: string) {
  const setError = () =>
    useVoice2RxStore.getState().setSessionV2Content(sessionId, {
      phase: SESSION_PHASE.ERROR,
      error: { code: 'processing_failed', message: 'Failed to process data. Please try again.' },
    });

  pollAndLoadSessionDetails(sessionId, SESSION_PHASE.OUTPUT, { transcriptFirst: true })
    .then((result) => {
      if (result === 'failed') setError();
    })
    .catch((error) => {
      console.error('background session poll failed:', error);
      setError();
    });
}
