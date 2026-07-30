import type { ColumnConfig, CustomColumn, TableConfig } from './types';

export type OrderedColumn =
  | { origin: 'builtin'; key: string; column: ColumnConfig }
  | { origin: 'custom'; key: string; column: CustomColumn };

export function getOrderedColumns(
  config: TableConfig,
  opts: { customColumns: CustomColumn[]; hiddenColumns: string[]; columnOrder?: string[] }
): OrderedColumn[] {
  const { customColumns, hiddenColumns, columnOrder = [] } = opts;

  const builtin: OrderedColumn[] = config.columns
    .filter((c) => !hiddenColumns.includes(c.key))
    .map((column) => ({ origin: 'builtin', key: column.key, column }));
  const custom: OrderedColumn[] = customColumns.map((column) => ({
    origin: 'custom',
    key: column.key,
    column,
  }));
  const all = [...builtin, ...custom];
  if (columnOrder.length === 0) return all;

  const remaining = new Map(all.map((oc) => [oc.key, oc]));
  const ordered: OrderedColumn[] = [];
  for (const key of columnOrder) {
    const oc = remaining.get(key);
    if (!oc) continue;
    ordered.push(oc);
    remaining.delete(key);
  }
  for (const oc of all) {
    if (remaining.has(oc.key)) ordered.push(oc);
  }
  return ordered;
}
