import { DEFAULT_NEW_COL_PX, readColumnWidths, type ColumnWidths } from '../table/compute-layout';
import { generateCustomColumnKey, normalizeCustomColumns } from '../table/custom-columns';
import { getRenderedWidths } from '../table/rendered-widths';

type TableAttrs = Record<string, unknown>;

type ColumnPatch = {
  columns: { key: string; label: string }[];
  columnWidths: ColumnWidths;
};

export function addColumnPatch(attrs: TableAttrs): ColumnPatch {
  const key = generateCustomColumnKey();

  const tableId = typeof attrs.sectionKey === 'string' ? attrs.sectionKey : '';
  const onScreen = getRenderedWidths(tableId);
  const existing = Object.keys(onScreen).length > 0 ? onScreen : readColumnWidths(attrs.columnWidths);

  return {
    columns: [...normalizeCustomColumns(attrs.columns), { key, label: '' }],
    columnWidths: { ...existing, [key]: DEFAULT_NEW_COL_PX },
  };
}

export function removeColumnPatch(attrs: TableAttrs, key: string): ColumnPatch {
  const columnWidths = readColumnWidths(attrs.columnWidths);
  delete columnWidths[key];
  return {
    columns: normalizeCustomColumns(attrs.columns).filter((column) => column.key !== key),
    columnWidths,
  };
}
