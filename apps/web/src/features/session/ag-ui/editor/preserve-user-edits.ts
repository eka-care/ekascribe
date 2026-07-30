import type { JSONContent } from '@tiptap/core';

import { LAB_RESULT_CONFIG } from './lab-result/lab-result-config';

const TABLE_ATTRS = ['columns', 'columnWidths', 'columnOrder', 'hiddenColumns'] as const;
const ROW_ATTRS = ['customFields', 'trend', 'pendingConflict'] as const;

const IDENTITY_COLUMN = LAB_RESULT_CONFIG.columns.find((col) => col.onSelect);
const EKA_ID_ATTR = IDENTITY_COLUMN?.onSelect?.ekaIdAttr;
const VITAL_ID_ATTR = IDENTITY_COLUMN?.onSelect?.idAttr;
const NAME_ATTR = IDENTITY_COLUMN?.key;

function collect(node: JSONContent, type: string, out: JSONContent[] = []): JSONContent[] {
  if (node.type === type) out.push(node);
  node.content?.forEach((child) => collect(child, type, out));
  return out;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function rowKeys(row: JSONContent): string[] {
  const attrs = (row.attrs ?? {}) as Record<string, unknown>;
  const keys: string[] = [];
  const ekaId = EKA_ID_ATTR ? text(attrs[EKA_ID_ATTR]) : '';
  const vitalId = VITAL_ID_ATTR ? text(attrs[VITAL_ID_ATTR]) : '';
  const name = NAME_ATTR ? text(attrs[NAME_ATTR]).toLowerCase() : '';
  if (ekaId) keys.push(`eka:${ekaId}`);
  if (vitalId) keys.push(`vital:${vitalId}`);
  if (name) keys.push(`name:${name}`);
  return keys;
}

function indexRows(rows: JSONContent[]): Map<string, JSONContent> {
  const index = new Map<string, JSONContent | null>();
  rows.forEach((row) => {
    rowKeys(row).forEach((key) => index.set(key, index.has(key) ? null : row));
  });
  const unique = new Map<string, JSONContent>();
  index.forEach((row, key) => {
    if (row) unique.set(key, row);
  });
  return unique;
}

function carryOver(
  target: JSONContent,
  source: JSONContent,
  attrs: readonly string[]
): void {
  const from = (source.attrs ?? {}) as Record<string, unknown>;
  const kept: Record<string, unknown> = {};
  attrs.forEach((key) => {
    if (from[key] !== undefined) kept[key] = from[key];
  });
  target.attrs = { ...target.attrs, ...kept };
}

export function preserveLabResultEdits(
  prev: JSONContent | null | undefined,
  next: JSONContent
): JSONContent {
  if (!prev) return next;

  const prevTablesByKey = new Map<string, JSONContent>();
  collect(prev, LAB_RESULT_CONFIG.tableName).forEach((table) => {
    const sectionKey = text(table.attrs?.sectionKey);
    if (sectionKey) prevTablesByKey.set(sectionKey, table);
  });
  if (prevTablesByKey.size === 0) return next;

  collect(next, LAB_RESULT_CONFIG.tableName).forEach((table) => {
    const prevTable = prevTablesByKey.get(text(table.attrs?.sectionKey));
    if (!prevTable) return;

    carryOver(table, prevTable, TABLE_ATTRS);

    const isRow = (node: JSONContent) => node.type === LAB_RESULT_CONFIG.rowName;
    const prevRows = indexRows((prevTable.content ?? []).filter(isRow));
    if (prevRows.size === 0) return;

    (table.content ?? []).filter(isRow).forEach((row) => {
      const prevRow = rowKeys(row)
        .map((key) => prevRows.get(key))
        .find(Boolean);
      if (prevRow) carryOver(row, prevRow, ROW_ATTRS);
    });
  });

  return next;
}
