import { SESSION_PHASE } from '@/constants/enums';
import type { TResolvedSessionPreferences } from './utils/resolve-session-preferences';

// --- Session Phase ---
export type SessionV2Phase = `${SESSION_PHASE}`;

// --- Store Slice 1: Recording Pointer ---
// Singleton — tracks which session (if any) is actively recording.
// All per-session data lives in SessionV2Content.
export type SessionV2Ongoing = {
  recording_session_id: string;
};

export type SessionV2Error = {
  code: string;
  message: string;
  failed_files?: string[];
  api_code?: string;
};

// --- Store Slice 2: Content By ID ---
export type NormalizedDocument = {
  document_id: string;
  template_id: string;
  document_name: string;
  document_type: 'notes' | 'context' | 'transcript' | 'integration' | 'custom';
  type: string;
  status: string;
  errors: SessionV2Error[];
  warnings: SessionV2Error[];
  edit_url: string | null;
  get_url: string | null;
  content: string | null;
  lang?: string;
  last_saved_at?: number;
};

export type PastePosition = 'top' | 'bottom';

export type SessionV2UiState = {
  loading: boolean;
  poll_status: 'idle' | 'polling' | 'success' | 'failed' | 'timeout';
  selected_tab: string;
  selected_transcript_lang: string;
  save_status_by_doc: Record<string, 'idle' | 'typing' | 'synced' | 'error'>;
  last_synced_at: number;
  is_template_processing: boolean;
  transcript_loading: Record<string, boolean>;
  pending_paste_scroll_doc_id: string | null;
  pending_reload_doc_id: string | null;
};

export type SessionV2Content = {
  // --- Identity & lifecycle ---
  phase: SessionV2Phase;
  error: SessionV2Error | null;
  is_limit_exceeded: boolean;
  created_at: string;
  upload_url: Record<string, unknown>;
  expires_at: string;

  // --- Recording runtime ---
  session_duration: number;
  audio_amplitudes: number[];
  is_speaking: boolean;
  chunk_transcripts: Record<string, string>;
  uploaded_chunks: string[];
  upload_progress: { success: number; total: number };

  // --- Session details (from API) ---
  audio_matrix: { quality: string } | null;
  additional_data: Record<string, unknown>;
  /** Session meta (title, …) — mirrors the API's session_details key. */
  session_details: Record<string, unknown>;
  session_config: TResolvedSessionPreferences | null;
  session_context: {
    past_sessions?: Array<{ date_epoch: number; session_id: string }>;
    documents?: string[];
    attachments?: Array<{ id: string; patient_oid?: string }>;
  };
  user_status: string;
  context: NormalizedDocument[];
  transcript: NormalizedDocument[];
  documents: NormalizedDocument[];
  ui: SessionV2UiState;
};
