import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';

import { GenericRowView } from './generic-row-view';
import type { ConflictValue, TableConfig, TrendEntry } from './types';

type StringAttr = {
  default: string;
  parseHTML: (el: HTMLElement) => string;
  renderHTML: (attrs: Record<string, unknown>) => Record<string, string>;
};

type JsonAttr<T> = {
  default: T;
  parseHTML: (el: HTMLElement) => T;
  renderHTML: (attrs: Record<string, unknown>) => Record<string, string>;
};

function stringAttr(dataAttr: string, attrKey: string): StringAttr {
  return {
    default: '',
    parseHTML: (el) => el.getAttribute(dataAttr) ?? '',
    renderHTML: (attrs) => ({ [dataAttr]: (attrs[attrKey] as string) ?? '' }),
  };
}

function jsonAttr<T>(dataAttr: string, attrKey: string, fallback: T): JsonAttr<T> {
  return {
    default: fallback,
    parseHTML: (el) => {
      const raw = el.getAttribute(dataAttr);
      if (!raw) return fallback;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return fallback;
      }
    },
    renderHTML: (attrs) => ({ [dataAttr]: JSON.stringify(attrs[attrKey] ?? fallback) }),
  };
}

export function createRowNode(config: TableConfig) {
  const attrDefs: Record<string, StringAttr | JsonAttr<unknown>> = {};

  for (const col of config.columns) {
    const dataAttr = `data-${col.key.replace(/_/g, '-')}`;
    attrDefs[col.key] = stringAttr(dataAttr, col.key);
  }

  for (const col of config.columns) {
    if (col.onSelect?.idAttr && !attrDefs[col.onSelect.idAttr]) {
      attrDefs[col.onSelect.idAttr] = stringAttr(`data-${col.onSelect.idAttr}`, col.onSelect.idAttr);
    }
    if (col.onSelect?.ekaIdAttr && !attrDefs[col.onSelect.ekaIdAttr]) {
      attrDefs[col.onSelect.ekaIdAttr] = stringAttr(`data-${col.onSelect.ekaIdAttr}`, col.onSelect.ekaIdAttr);
    }
    if (col.onSelect?.unitsAttr && !attrDefs[col.onSelect.unitsAttr]) {
      attrDefs[col.onSelect.unitsAttr] = jsonAttr<string[]>(`data-${col.onSelect.unitsAttr}`, col.onSelect.unitsAttr, []);
    }
  }

  if (config.supportsConflict) {
    attrDefs.date = stringAttr('data-date', 'date');
    attrDefs.trend = jsonAttr<TrendEntry[]>('data-trend', 'trend', []);
    attrDefs.pendingConflict = jsonAttr<ConflictValue | null>('data-pending-conflict', 'pendingConflict', null);
  }

  if (config.supportsAddColumn) {
    attrDefs.customFields = jsonAttr<Record<string, string>>('data-custom-fields', 'customFields', {});
  }

  const View = config.rowView ?? GenericRowView;
  function RowViewWrapper(props: NodeViewProps) {
    return <View {...props} config={config} />;
  }

  return Node.create({
    name: config.rowName,
    group: 'block',
    atom: true,
    selectable: false,
    draggable: false,

    addAttributes() {
      return attrDefs;
    },

    parseHTML() {
      return [{ tag: `div.${config.rowCssClass}` }];
    },

    renderHTML({ HTMLAttributes }) {
      return ['div', mergeAttributes(HTMLAttributes, { class: config.rowCssClass })];
    },

    addNodeView() {
      return ReactNodeViewRenderer(RowViewWrapper, {
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
}
