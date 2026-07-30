import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';

import { VitalRowView } from './vital-row-view';

export type VitalRowAttrs = {
  vital_name: string;
  value: string;
  unit: string;
  normal_range: string;
  notes: string;
};

export const VitalRow = Node.create({
  name: 'vitalRow',
  group: 'block',
  atom: true,
  selectable: false,
  draggable: false,

  addAttributes() {
    return {
      vital_name: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-vital-name') ?? '',
        renderHTML: (attrs) => ({ 'data-vital-name': attrs.vital_name ?? '' }),
      },
      value: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-value') ?? '',
        renderHTML: (attrs) => ({ 'data-value': attrs.value ?? '' }),
      },
      unit: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-unit') ?? '',
        renderHTML: (attrs) => ({ 'data-unit': attrs.unit ?? '' }),
      },
      normal_range: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-normal-range') ?? '',
        renderHTML: (attrs) => ({ 'data-normal-range': attrs.normal_range ?? '' }),
      },
      notes: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-notes') ?? '',
        renderHTML: (attrs) => ({ 'data-notes': attrs.notes ?? '' }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div.vital-row' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { class: 'vital-row' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(VitalRowView, {
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
        serialize() {},
        parse: {},
      },
    };
  },
});
