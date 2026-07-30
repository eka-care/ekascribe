import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import type { MarkdownSerializerState } from 'prosemirror-markdown';
import type { Node as PMNode } from 'prosemirror-model';

import { VitalTableView } from './vital-table-view';

function escapeCell(value: unknown): string {
  return String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\n+/g, ' ')
    .trim();
}

export const VitalTable = Node.create({
  name: 'vitalTable',
  group: 'block',
  content: 'vitalRow+',
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
    };
  },

  parseHTML() {
    return [{ tag: 'div.vital-table' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { class: 'vital-table' }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(VitalTableView, {
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
        serialize(state: MarkdownSerializerState, node: PMNode) {
          state.write('| Vital | Value | Unit | Normal Range | Notes |');
          state.ensureNewLine();
          state.write('| --- | --- | --- | --- | --- |');
          state.ensureNewLine();

          node.forEach((row) => {
            const a = row.attrs as Record<string, unknown>;
            state.write(
              `| ${escapeCell(a.vital_name)} | ${escapeCell(a.value)} | ${escapeCell(a.unit)} | ${escapeCell(a.normal_range)} | ${escapeCell(a.notes)} |`
            );
            state.ensureNewLine();
          });

          state.closeBlock(node);
        },
        parse: {},
      },
    };
  },
});
