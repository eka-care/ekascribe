import { getMdbV1Procedures } from '@/fetch-client/get-mdb-v1-procedures';

import type { TableConfig, SearchFn } from '../table/types';

const procedureSearchFn: SearchFn = async (query, docid, signal) => {
  const res = await getMdbV1Procedures({ q: query, limit: 8, docid, signal });
  return (res.data ?? []).map((item) => ({
    id: item.id,
    name: item.name,
    subtitle: item.common_name && item.common_name !== item.name ? item.common_name : undefined,
  }));
};

export const PROCEDURE_CONFIG: TableConfig = {
  tableName: 'procedureTable',
  rowName: 'procedureRow',
  cssClass: 'procedure-table',
  rowCssClass: 'procedure-row',
  bodyClassName: 'procedure-table-body',
  columns: [
    { key: 'procedure_name', label: 'Procedure', kind: 'autocomplete', searchFn: procedureSearchFn },
    {
      key: 'timing',
      label: 'Timing',
      kind: 'dropdown',
      options: ['Today', 'Tomorrow', 'Day After Tomorrow'],
    },
    { key: 'note', label: 'Note', kind: 'text' },
  ],
  gridTemplate: 'minmax(200px, 2fr) minmax(120px, 1fr) minmax(150px, 1.5fr) 32px',
};
