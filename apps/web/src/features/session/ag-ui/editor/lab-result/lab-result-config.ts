import { getMdbV1InvReadings } from '@/fetch-client/get-mdb-v1-inv-readings';

import type { TableConfig, SearchFn } from '../table/types';
import { LabResultTableView } from './lab-result-table-view';
import { LabResultRowView } from './lab-result-row-view';

export const labTestSearchFn: SearchFn = async (query, docid, signal) => {
  const res = await getMdbV1InvReadings({ q: query, limit: 8, docid, signal });
  return (res.data ?? []).map((item) => ({
    id: item.id,
    name: item.name,
    subtitle: item.common_name && item.common_name !== item.name ? item.common_name : undefined,
    units: item.all_units?.map((u) => u.name),
  }));
};

export const LAB_STATUS_OPTIONS = ['High', 'Normal', 'Low'];

export const LAB_RESULT_CONFIG: TableConfig = {
  tableName: 'labResultTable',
  rowName: 'labResultRow',
  cssClass: 'lab-result-table',
  rowCssClass: 'lab-result-row',
  bodyClassName: 'lab-result-table-body',
  columns: [
    {
      key: 'test_name',
      label: 'Test Name',
      kind: 'autocomplete',
      searchFn: labTestSearchFn,
      onSelect: { idAttr: 'vitalId', ekaIdAttr: 'ekaId', unitsAttr: 'availableUnits', autoFillUnitColumnKey: 'unit' },
      width: 'minmax(220px, 1fr)',
    },
    { key: 'value', label: 'Value', kind: 'value', width: 'minmax(110px, 1fr)' },
    {
      key: 'unit',
      label: 'Unit',
      kind: 'dropdown',
      optionsFromAttr: 'availableUnits',
      width: 'minmax(110px, 1fr)',
    },
    { key: 'reference_range', label: 'Reference Range', kind: 'text', width: 'minmax(160px, 1fr)' },
    {
      key: 'out_of_range',
      label: 'Status',
      kind: 'dropdown',
      options: LAB_STATUS_OPTIONS,
      width: 'minmax(110px, 1fr)',
    },
  ],
  gridTemplate: 'minmax(220px, 1fr) minmax(110px, 1fr) minmax(110px, 1fr) minmax(160px, 1fr) minmax(110px, 1fr)',
  supportsAddColumn: true,
  supportsConflict: true,
  alwaysShowDelete: true,
  tableView: LabResultTableView,
  rowView: LabResultRowView,
};
