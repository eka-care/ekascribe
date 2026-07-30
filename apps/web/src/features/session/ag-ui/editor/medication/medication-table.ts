/**
 * MedicationTable — custom block node for MEDICATION_TABLE sections.
 *
 * Renders an interactive medication table with autocomplete, dropdowns,
 * and inline editing via a React NodeView. Children are medicationRow
 * atom nodes.
 *
 * Attrs:
 *   - sectionKey: stable section identifier from AG-UI
 *   - columns: JSON-serialized MedicationColumnDef[] describing the
 *     active columns (predefined + any user-added custom columns)
 */

import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import type { MarkdownSerializerState } from 'prosemirror-markdown';
import type { Node as PMNode } from 'prosemirror-model';

import { MedicationTableView } from './medication-table-view';
import type { MedicationColumnDef } from './medication-columns';

const PREDEFINED_ROW_KEYS = new Set([
  'drug_name', 'raw_name', 'strength', 'dosage', 'frequency', 'timing',
  'duration', 'route', 'quantity', 'notes', 'suggestions',
  'medication_id', 'match_type', 'original_drug_name',
]);

function escapeMarkdownCell(value: unknown): string {
  return String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\n+/g, ' ')
    .trim();
}

export type MedicationTableAttrs = {
  sectionKey: string;
  columns: MedicationColumnDef[];
};

export const MedicationTable = Node.create({
  name: 'medicationTable',
  group: 'block',
  content: 'medicationRow+',
  defining: true,
  isolating: true,
  selectable: false,

  addAttributes() {
    return {
      sectionKey: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-section-key') ?? '',
        renderHTML: (attrs) => ({ 'data-section-key': attrs.sectionKey ?? '' }),
      },
      columns: {
        default: [] as MedicationColumnDef[],
        parseHTML: (el) => {
          try {
            return JSON.parse(el.getAttribute('data-columns') ?? '[]');
          } catch {
            return [];
          }
        },
        renderHTML: (attrs) => ({
          'data-columns': JSON.stringify(attrs.columns ?? []),
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div.medication-table' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { class: 'medication-table' }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MedicationTableView, {
      stopEvent: ({ event }) => {
        const target = event.target as HTMLElement | null;
        if (!target) return false;
        return !!target.closest('input, textarea, select, button, [role="button"]');
      },
    });
  },

  addStorage() {
    const SKIP_IN_MARKDOWN = new Set([
      'suggestions', 'medication_id', 'match_type', 'original_drug_name',
    ]);

    return {
      markdown: {
        serialize(state: MarkdownSerializerState, node: PMNode) {
          const allColumns = (node.attrs.columns ?? []) as MedicationColumnDef[];
          const columns = allColumns.filter((c) => !SKIP_IN_MARKDOWN.has(c.key));
          if (!columns.length) {
            state.closeBlock(node);
            return;
          }

          // Header row + delimiter
          state.write('| ' + columns.map((c) => escapeMarkdownCell(c.label)).join(' | ') + ' |');
          state.ensureNewLine();
          state.write('| ' + columns.map(() => '---').join(' | ') + ' |');
          state.ensureNewLine();

          // Data rows
          node.forEach((row) => {
            const attrs = row.attrs as Record<string, unknown>;
            const customFields = (attrs.customFields ?? {}) as Record<string, string>;
            const cells = columns.map((col) => {
              const raw = PREDEFINED_ROW_KEYS.has(col.key)
                ? attrs[col.key]
                : customFields[col.key];
              return escapeMarkdownCell(raw);
            });
            state.write('| ' + cells.join(' | ') + ' |');
            state.ensureNewLine();
          });

          state.closeBlock(node);
        },
        parse: {},
      },
    };
  },
});
