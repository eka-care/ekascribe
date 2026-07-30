/**
 * KVList / KVItem — block nodes for SectionKind === 'KEY_VALUE'.
 *
 * Layout (DOM): <dl class="kv-list"> <dt>key</dt> <dd>value...</dd> ... </dl>
 * Structure:    kvList ( kvItem ( inline content ) ) ⁺
 *
 * Each kvItem keeps its key as an attribute (rendered via NodeView)
 * and its value as ProseMirror inline content — so the value can hold
 * arbitrary inline marks (bold/italic/links). The key label is
 * editable via a small inline <input> rendered by the NodeView.
 */

import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import type { MarkdownSerializerState } from 'prosemirror-markdown';
import type { Node as PMNode } from 'prosemirror-model';

import { KvItemView } from './kv-item-view';

export const KVList = Node.create({
  name: 'kvList',
  group: 'block',
  content: 'kvItem+',
  defining: true,

  parseHTML() {
    return [{ tag: 'dl.kv-list' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['dl', mergeAttributes(HTMLAttributes, { class: 'kv-list' }), 0];
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: MarkdownSerializerState, node: PMNode) {
          state.renderContent(node);
          state.closeBlock(node);
        },
        parse: {},
      },
    };
  },
});

export type KvItemAttrs = {
  keyName: string;
};

export const KVItem = Node.create({
  name: 'kvItem',
  group: 'block',
  content: 'inline*',
  defining: true,

  addAttributes() {
    return {
      keyName: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-key-name') ?? '',
        renderHTML: (attrs) => ({ 'data-key-name': attrs.keyName ?? '' }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div.kv-item' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { class: 'kv-item' }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(KvItemView);
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: MarkdownSerializerState, node: PMNode) {
          const keyName = (node.attrs.keyName as string) ?? '';
          if (keyName.trim()) state.write(`**${keyName}**: `);
          state.renderInline(node);
          state.closeBlock(node);
        },
        parse: {},
      },
    };
  },
});
