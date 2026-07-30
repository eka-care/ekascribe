/**
 * Maps an AG-UI MEDICATION_TABLE section payload into Tiptap JSON
 * nodes: one medicationTable containing medicationRow children.
 *
 * Agent headers are matched against PREDEFINED_MEDICATION_COLUMNS by key.
 * Matched headers use the predefined column definition (kind, options).
 * Unmatched headers become free-text custom columns.
 */

import type { JSONContent } from '@tiptap/core';

import type { TablePayload } from '../../types';
import {
  PREDEFINED_MEDICATION_COLUMNS,
  getColumnDef,
  type MedicationColumnDef,
  type MedicationSuggestion,
} from './medication-columns';

const PREDEFINED_KEYS = new Set(PREDEFINED_MEDICATION_COLUMNS.map((c) => c.key));

// const SUGGESTION_SCORE_THRESHOLD = 0.7;

export function medicationPayloadToBody(
  sectionKey: string,
  payload: Partial<TablePayload>
): JSONContent {
  const headers = Array.isArray(payload.headers) ? payload.headers : [];
  const rows = Array.isArray(payload.rows) ? payload.rows : [];

  const columns = buildColumns(headers);

  const rowNodes: JSONContent[] = rows.length
    ? rows.map((row) => buildRowNode(row, columns))
    : [buildEmptyRowNode()];

  return {
    type: 'medicationTable',
    attrs: {
      sectionKey,
      columns,
    },
    content: rowNodes,
  };
}

function buildColumns(headers: TablePayload['headers']): MedicationColumnDef[] {
  return headers.map((header) => {
    const predefined = getColumnDef(header.key);
    if (predefined) return predefined;

    return {
      key: header.key,
      label: header.label,
      kind: 'text' as const,
    };
  });
}

function buildRowNode(row: Record<string, unknown>, columns: MedicationColumnDef[]): JSONContent {
  const attrs: Record<string, unknown> = {};
  const customFields: Record<string, string> = {};

  for (const col of columns) {
    const value = row[col.key];
    if (PREDEFINED_KEYS.has(col.key)) {
      if (col.key === 'suggestions') {
        attrs.suggestions = Array.isArray(value) ? value : [];
      } else {
        attrs[col.key] = String(value ?? '');
      }
    } else {
      customFields[col.key] = String(value ?? '');
    }
  }

  // Map row-level metadata that may not be in headers
  attrs.medication_id = String(row.medication_id ?? '');
  attrs.match_type = String(row.match_type ?? 'none');

  attrs.original_drug_name = String(row.drug_name ?? '');

  // Filter suggestions — only keep those above the score threshold
  const allSuggestions = (attrs.suggestions ?? []) as MedicationSuggestion[];
  attrs.suggestions = allSuggestions;
  // attrs.suggestions = allSuggestions.filter((s) => s.score > SUGGESTION_SCORE_THRESHOLD);

  attrs.customFields = customFields;

  return {
    type: 'medicationRow',
    attrs,
  };
}

function buildEmptyRowNode(): JSONContent {
  return {
    type: 'medicationRow',
    attrs: { customFields: {} },
  };
}
