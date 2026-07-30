/**
 * Serializes a medicationTable Tiptap node into a pipe-delimited
 * markdown table. Used as the fallback representation for storage.
 */

import type { JSONContent } from '@tiptap/core';
import type { MedicationColumnDef } from './medication-columns';

const PREDEFINED_KEYS = new Set([
  'drug_name', 'raw_name', 'strength', 'dosage', 'frequency', 'timing',
  'duration', 'route', 'quantity', 'notes', 'suggestions',
  'medication_id', 'match_type', 'original_drug_name',
]);

// Keys excluded from markdown output (metadata or non-text)
const SKIP_IN_MARKDOWN = new Set([
  'suggestions', 'medication_id', 'match_type', 'original_drug_name',
]);

export function medicationTableToMarkdown(node: JSONContent): string {
  const allColumns = (node.attrs?.columns ?? []) as MedicationColumnDef[];
  const columns = allColumns.filter((c) => !SKIP_IN_MARKDOWN.has(c.key));
  const rows = (node.content ?? []).filter((c) => c.type === 'medicationRow');

  if (!columns.length) return '';

  const lines: string[] = [];

  // Header
  lines.push('| ' + columns.map((c) => c.label).join(' | ') + ' |');
  lines.push('| ' + columns.map(() => '---').join(' | ') + ' |');

  // Data rows
  for (const row of rows) {
    const attrs = row.attrs ?? {};
    const customFields = (attrs.customFields ?? {}) as Record<string, string>;

    const cells = columns.map((col) => {
      if (PREDEFINED_KEYS.has(col.key)) return (attrs[col.key] as string) ?? '';
      return customFields[col.key] ?? '';
    });

    lines.push('| ' + cells.join(' | ') + ' |');
  }

  return lines.join('\n');
}
