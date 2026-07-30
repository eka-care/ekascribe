import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import type { MarkdownSerializerState } from 'prosemirror-markdown';
import type { Node as PMNode } from 'prosemirror-model';

import { getOrderedColumns } from './column-order';
import { normalizeCustomColumns } from './custom-columns';
import { GenericTableView } from './generic-table-view';
import type { TableConfig } from './types';

function escapeCell(value: unknown): string {
  return String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\n+/g, ' ')
    .trim();
}

export function createTableNode(config: TableConfig) {
  const View = config.tableView ?? GenericTableView;
  function TableViewWrapper(props: NodeViewProps) {
    return <View {...props} config={config} />;
  }

  return Node.create({
    name: config.tableName,
    group: 'block',
    content: `${config.rowName}+`,
    defining: true,
    isolating: true,
    selectable: false,

    addAttributes() {
      const attrs: Record<string, unknown> = {
        sectionKey: {
          default: '',
          parseHTML: (el: HTMLElement) => el.getAttribute('data-section-key') ?? '',
          renderHTML: (attrs: Record<string, unknown>) => ({ 'data-section-key': attrs.sectionKey ?? '' }),
        },
      };

      if (config.supportsAddColumn) {
        attrs.columns = {
          default: [] as unknown[],
          parseHTML: (el: HTMLElement) => {
            const raw = el.getAttribute('data-columns');
            if (!raw) return [];
            try {
              return JSON.parse(raw) as unknown[];
            } catch {
              return [];
            }
          },
          renderHTML: (attrs: Record<string, unknown>) => ({ 'data-columns': JSON.stringify(attrs.columns ?? []) }),
        };
        attrs.hiddenColumns = {
          default: [] as string[],
          parseHTML: (el: HTMLElement) => {
            const raw = el.getAttribute('data-hidden-columns');
            if (!raw) return [];
            try {
              return JSON.parse(raw) as string[];
            } catch {
              return [];
            }
          },
          renderHTML: (attrs: Record<string, unknown>) => ({
            'data-hidden-columns': JSON.stringify(attrs.hiddenColumns ?? []),
          }),
        };
        attrs.columnWidths = {
          default: {} as Record<string, string>,
          parseHTML: (el: HTMLElement) => {
            const raw = el.getAttribute('data-column-widths');
            if (!raw) return {};
            try {
              return JSON.parse(raw) as Record<string, string>;
            } catch {
              return {};
            }
          },
          renderHTML: (attrs: Record<string, unknown>) => ({
            'data-column-widths': JSON.stringify(attrs.columnWidths ?? {}),
          }),
        };
        attrs.columnOrder = {
          default: [] as string[],
          parseHTML: (el: HTMLElement) => {
            const raw = el.getAttribute('data-column-order');
            if (!raw) return [];
            try {
              return JSON.parse(raw) as string[];
            } catch {
              return [];
            }
          },
          renderHTML: (attrs: Record<string, unknown>) => ({
            'data-column-order': JSON.stringify(attrs.columnOrder ?? []),
          }),
        };
      }

      return attrs;
    },

    parseHTML() {
      return [{ tag: `div.${config.cssClass}` }];
    },

    renderHTML({ HTMLAttributes }) {
      return ['div', mergeAttributes(HTMLAttributes, { class: config.cssClass }), 0];
    },

    addNodeView() {
      return ReactNodeViewRenderer(TableViewWrapper, {
        stopEvent: ({ event }) => {
          const target = event.target as HTMLElement | null;
          if (!target) return false;
          return !!target.closest(
            'input, textarea, select, button, [role="button"], [data-col-resize-handle], [data-col-reorder-handle]'
          );
        },
      });
    },

    addStorage() {
      return {
        markdown: {
          serialize(state: MarkdownSerializerState, node: PMNode) {
            const customColumns = config.supportsAddColumn ? normalizeCustomColumns(node.attrs.columns) : [];
            const hiddenColumns = config.supportsAddColumn ? ((node.attrs.hiddenColumns ?? []) as string[]) : [];
            const orderedColumns = getOrderedColumns(config, { customColumns, hiddenColumns });
            const labels = orderedColumns.map((oc) => oc.column.label);

            state.write('| ' + labels.map(escapeCell).join(' | ') + ' |');
            state.ensureNewLine();
            state.write('| ' + labels.map(() => '---').join(' | ') + ' |');
            state.ensureNewLine();

            node.forEach((row) => {
              const a = row.attrs as Record<string, unknown>;
              const customFields = (a.customFields ?? {}) as Record<string, string>;
              const cells = orderedColumns.map((oc) => (oc.origin === 'builtin' ? a[oc.key] : customFields[oc.key]));
              state.write('| ' + cells.map(escapeCell).join(' | ') + ' |');
              state.ensureNewLine();
            });

            state.closeBlock(node);
          },
          parse: {},
        },
      };
    },
  });
}
