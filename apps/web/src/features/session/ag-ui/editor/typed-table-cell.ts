/**
 * TypedTableCell — extends @tiptap/extension-table-cell with two attrs:
 *   - colKey:   the BE column key this cell maps to (TableColumn.key)
 *   - cellType: 'text' | 'markdown' | 'number' | 'date'
 *
 * We intentionally do NOT add a React NodeView here. prosemirror-tables
 * does its own cell positioning and selection bookkeeping against the
 * raw <td> DOM; wrapping the cell in a NodeViewWrapper breaks table
 * layout and selection. Typed widgets for number/date cells will be
 * reintroduced as inline atom nodes inside the cell content — not as
 * cell-level NodeViews.
 */

import { TableCell } from '@tiptap/extension-table-cell';

import type { ColumnType } from '../types';

export type TypedTableCellAttrs = {
  colKey: string | null;
  cellType: ColumnType;
};

export const TypedTableCell = TableCell.extend({
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
