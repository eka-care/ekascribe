/**
 * TypedTableHeader — extends @tiptap/extension-table-header to carry
 * the BE-supplied column key and column type. The cellType on the
 * header itself drives nothing visually; it just survives a round-trip
 * to ScribeState so cells in this column stay typed correctly.
 */

import { TableHeader } from '@tiptap/extension-table-header';

import type { ColumnType } from '../types';

export type TypedTableHeaderAttrs = {
  colKey: string | null;
  cellType: ColumnType;
};

export const TypedTableHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      colKey: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-col-key'),
        renderHTML: (attrs) =>
          attrs.colKey ? { 'data-col-key': attrs.colKey } : {},
      },
      cellType: {
        default: 'markdown' as ColumnType,
        parseHTML: (el) =>
          (el.getAttribute('data-cell-type') as ColumnType | null) ?? 'markdown',
        renderHTML: (attrs) => ({ 'data-cell-type': attrs.cellType }),
      },
    };
  },
});
