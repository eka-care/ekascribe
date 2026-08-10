/**
 * FE mirrors of the AG-UI ScribeState shapes from voice2rx-be
 * (voice2rx/services/templates/ag_ui/payloads.py).
 *
 * The BE collapsed all medical-specific kinds into four generic render
 * kinds: LIST, TABLE, KEY_VALUE, NARRATIVE. The LLM picks the kind that
 * fits a doctor-template heading and fills the payload with markdown.
 */

export type SectionKind = 'LIST' | 'TABLE' | 'KEY_VALUE' | 'NARRATIVE';

export type SectionStatusState =
  | 'pending'
  | 'extracting'
  | 'awaiting_input'
  | 'ready'
  | 'saved'
  | 'error';

export type SectionStatus = {
  state: SectionStatusState;
  error?: string | null;
};

export type Section = {
  key: string;
  display_name: string;
  kind: SectionKind;
  payload: Record<string, unknown>;
  order: number;
  status: SectionStatus;
  edited_by_user?: boolean;
};

export type ColumnType = 'text' | 'markdown' | 'number' | 'date' | 'pills';

export type TableColumn = {
  key: string;
  label: string;
  type: ColumnType;
};

export type ListPayload = {
  items: string[];
};

export type TablePayload = {
  headers: TableColumn[];
  rows: Record<string, unknown>[];
};

export type KeyValueItem = {
  key: string;
  value: string;
};

export type KeyValuePayload = {
  items: KeyValueItem[];
};

export type NarrativePayload = {
  markdown: string;
};

export type ScribeState = {
  template_id: string;
  txn_id: string;
  document_id: string;
  transcript: string;
  sections: Section[];
  omitted_sections: string[];
  pending_tool_call_id?: string | null;
};

export type StreamPhase = 'idle' | 'connecting' | 'streaming' | 'finished' | 'error';

// AG-UI text messages (TEXT_MESSAGE_START/CONTENT/END) accumulated by
// message_id. `done` flips on TEXT_MESSAGE_END.
export type StreamMessage = {
  id: string;
  role: string;
  content: string;
  done: boolean;
};

// AG-UI tool calls. `args` is the streamed JSON string (may be partial
// until TOOL_CALL_END). `result` is set on TOOL_CALL_RESULT.
export type StreamToolCall = {
  id: string;
  name: string;
  args: string;
  result?: string;
  parent_message_id?: string;
  status: 'streaming' | 'ended' | 'completed';
};
