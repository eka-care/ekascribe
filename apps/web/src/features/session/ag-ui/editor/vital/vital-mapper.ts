import type { JSONContent } from '@tiptap/core';

import type { TablePayload } from '../../types';

export function vitalPayloadToBody(
  sectionKey: string,
  payload: Partial<TablePayload>
): JSONContent {
  const rows = Array.isArray(payload.rows) ? payload.rows : [];

  const rowNodes: JSONContent[] = rows.length
    ? rows.map((row) => ({
        type: 'vitalRow',
        attrs: {
          vital_name: row.vital_name ?? '',
          value: row.value ?? '',
          unit: row.unit ?? '',
          normal_range: row.normal_range ?? '',
          notes: row.notes ?? '',
        },
      }))
    : [{ type: 'vitalRow', attrs: {} }];

  return {
    type: 'vitalTable',
    attrs: { sectionKey },
    content: rowNodes,
  };
}
