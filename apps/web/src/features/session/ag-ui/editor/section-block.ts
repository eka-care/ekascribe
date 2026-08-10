/**
 * SectionBlock — wraps one ScribeState Section as a top-level editor
 * block. Holds the section metadata (key, kind, order, status) as
 * attributes so we can faithfully round-trip the doc back to a
 * ScribeState on save.
 *
 * Body content depends on the section kind, but we keep a single
 * `block+` content rule (rather than splitting into four node types)
 * to keep the schema small. The converters are the source of truth
 * for which body shape lives in a section with which kind.
 *
 *   LIST             → one bulletList child
 *   TABLE            → one table child (typed cells)
 *   KEY_VALUE        → one kvList child
 *   NARRATIVE        → one or more paragraph / heading / list children
 */

import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import type { MarkdownSerializerState } from 'prosemirror-markdown';
import type { Node as PMNode } from 'prosemirror-model';

import { SectionBlockView } from './section-block-view';
import type { SectionKind, SectionStatusState } from '../types';

export type SectionBlockAttrs = {
  sectionKey: string;
  kind: SectionKind;
  displayName: string;
  order: number;
  statusState: SectionStatusState;
  statusError: string | null;
  editedByUser: boolean;
};

export const SectionBlock = Node.create({
  name: 'sectionBlock',
  group: 'block',
  content: 'block+',
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      sectionKey: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-section-key') ?? '',
        renderHTML: (attrs) => ({ 'data-section-key': attrs.sectionKey ?? '' }),
      },
      kind: {
        default: 'NARRATIVE' as SectionKind,
        parseHTML: (el) =>
          (el.getAttribute('data-kind') as SectionKind | null) ?? 'NARRATIVE',
        renderHTML: (attrs) => ({ 'data-kind': attrs.kind }),
      },
      displayName: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-display-name') ?? '',
        renderHTML: (attrs) => ({ 'data-display-name': attrs.displayName ?? '' }),
      },
      order: {
        default: 0,
        parseHTML: (el) => Number(el.getAttribute('data-order') ?? 0),
        renderHTML: (attrs) => ({ 'data-order': String(attrs.order ?? 0) }),
      },
      statusState: {
        default: 'pending' as SectionStatusState,
        parseHTML: (el) =>
          (el.getAttribute('data-status') as SectionStatusState | null) ??
          'pending',
        renderHTML: (attrs) => ({ 'data-status': attrs.statusState }),
      },
      statusError: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-status-error'),
        renderHTML: (attrs) =>
          attrs.statusError ? { 'data-status-error': attrs.statusError } : {},
      },
      editedByUser: {
        default: false,
        parseHTML: (el) => el.getAttribute('data-edited') === 'true',
        renderHTML: (attrs) => ({
          'data-edited': attrs.editedByUser ? 'true' : 'false',
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'section.scribe-section' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'section',
      mergeAttributes(HTMLAttributes, { class: 'scribe-section' }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(SectionBlockView);
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: MarkdownSerializerState, node: PMNode) {
          const displayName = (node.attrs.displayName as string) ?? '';
          if (displayName.trim()) {
            state.write(`### ${displayName}`);
            state.closeBlock(node);
          }
          state.renderContent(node);
        },
        parse: {},
      },
    };
  },
});
