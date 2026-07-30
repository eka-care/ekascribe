/**
 * MedicationRow — atom node representing a single medication entry.
 *
 * Fully managed by React (atom: true). All cell values are stored as
 * node attributes so the entire row is a single ProseMirror node with
 * no inline content — editing happens inside the React NodeView.
 *
 * Predefined column values (drug_name, dosage, frequency, etc.) are
 * stored as top-level attrs. User-added custom columns are stored in
 * a JSON-serialized `customFields` attr.
 */

import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';

import { MedicationRowView } from './medication-row-view';

import type { MedicationSuggestion } from './medication-columns';

export type MedicationRowAttrs = {
  drug_name: string;
  raw_name: string;
  strength: string;
  dosage: string;
  frequency: string;
  timing: string;
  duration: string;
  route: string;
  quantity: string;
  notes: string;
  medication_id: string;
  match_type: string;
  original_drug_name: string;
  suggestions: MedicationSuggestion[];
  customFields: Record<string, string>;
};

export const MedicationRow = Node.create({
  name: 'medicationRow',
  group: 'block',
  atom: true,
  selectable: false,
  draggable: false,

  addAttributes() {
    return {
      drug_name: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-drug-name') ?? '',
        renderHTML: (attrs) => ({ 'data-drug-name': attrs.drug_name ?? '' }),
      },
      raw_name: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-raw-name') ?? '',
        renderHTML: (attrs) => ({ 'data-raw-name': attrs.raw_name ?? '' }),
      },
      strength: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-strength') ?? '',
        renderHTML: (attrs) => ({ 'data-strength': attrs.strength ?? '' }),
      },
      dosage: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-dosage') ?? '',
        renderHTML: (attrs) => ({ 'data-dosage': attrs.dosage ?? '' }),
      },
      frequency: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-frequency') ?? '',
        renderHTML: (attrs) => ({ 'data-frequency': attrs.frequency ?? '' }),
      },
      timing: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-timing') ?? '',
        renderHTML: (attrs) => ({ 'data-timing': attrs.timing ?? '' }),
      },
      duration: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-duration') ?? '',
        renderHTML: (attrs) => ({ 'data-duration': attrs.duration ?? '' }),
      },
      route: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-route') ?? '',
        renderHTML: (attrs) => ({ 'data-route': attrs.route ?? '' }),
      },
      quantity: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-quantity') ?? '',
        renderHTML: (attrs) => ({ 'data-quantity': attrs.quantity ?? '' }),
      },
      notes: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-notes') ?? '',
        renderHTML: (attrs) => ({ 'data-notes': attrs.notes ?? '' }),
      },
      medication_id: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-medication-id') ?? '',
        renderHTML: (attrs) => ({ 'data-medication-id': attrs.medication_id ?? '' }),
      },
      match_type: {
        default: 'none',
        parseHTML: (el) => el.getAttribute('data-match-type') ?? 'none',
        renderHTML: (attrs) => ({ 'data-match-type': attrs.match_type ?? 'none' }),
      },
      original_drug_name: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-original-drug-name') ?? '',
        renderHTML: (attrs) => ({ 'data-original-drug-name': attrs.original_drug_name ?? '' }),
      },
      suggestions: {
        default: [] as MedicationSuggestion[],
        parseHTML: (el) => {
          try {
            return JSON.parse(el.getAttribute('data-suggestions') ?? '[]');
          } catch {
            return [];
          }
        },
        renderHTML: (attrs) => ({
          'data-suggestions': JSON.stringify(attrs.suggestions ?? []),
        }),
      },
      customFields: {
        default: {} as Record<string, string>,
        parseHTML: (el) => {
          try {
            return JSON.parse(el.getAttribute('data-custom-fields') ?? '{}');
          } catch {
            return {};
          }
        },
        renderHTML: (attrs) => ({
          'data-custom-fields': JSON.stringify(attrs.customFields ?? {}),
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div.medication-row' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { class: 'medication-row' }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MedicationRowView, {
      stopEvent: ({ event }) => {
        const target = event.target as HTMLElement | null;
        if (!target) return false;
        return !!target.closest('input, textarea, select, button, [role="button"]');
      },
    });
  },

  addStorage() {
    return {
      markdown: {
        // No-op: rows are emitted as markdown table data rows by the
        // parent medicationTable serializer.
        serialize() {},
        parse: {},
      },
    };
  },
});
