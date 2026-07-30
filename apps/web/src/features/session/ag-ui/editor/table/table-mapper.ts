import type { JSONContent } from '@tiptap/core';

import type { TablePayload } from '../../types';
import type { TableConfig } from './types';

export function tablePayloadToNodes(
  config: TableConfig,
  sectionKey: string,
  payload: Partial<TablePayload>
): JSONContent {
  const rows = Array.isArray(payload.rows) ? payload.rows : [];

  const rowNodes: JSONContent[] = rows.length
    ? rows.map((row) => ({
        type: config.rowName,
        attrs: Object.fromEntries(
          config.columns.map((col) => [col.key, row[col.key] ?? ''])
        ),
      }))
    : [{ type: config.rowName }];

  return {
    type: config.tableName,
    attrs: { sectionKey },
    content: rowNodes,
  };
}
