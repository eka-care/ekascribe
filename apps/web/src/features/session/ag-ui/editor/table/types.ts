import type { ComponentType } from 'react';
import type { NodeViewProps } from '@tiptap/react';

export type SearchResult = {
  id: string;
  name: string;
  subtitle?: string;
  units?: string[];
};

export type SearchFn = (
  query: string,
  docid: string | undefined,
  signal: AbortSignal
) => Promise<SearchResult[]>;

export type ColumnKind = 'text' | 'dropdown' | 'autocomplete' | 'value';

export type TrendEntry = {
  value: string;
  unit: string;
  date?: string;
};

export type ConflictValue = {
  value: string;
  unit: string;
  date?: string;
};

export type CustomColumn = {
  key: string;
  label: string;
};

export type ColumnConfig = {
  key: string;
  label: string;
  kind: ColumnKind;
  options?: string[];
  optionsFromAttr?: string;
  searchFn?: SearchFn;
  onSelect?: {
    idAttr?: string;
    ekaIdAttr?: string;
    unitsAttr?: string;
    autoFillUnitColumnKey?: string;
  };
  width?: string;
};

export type TableConfig = {
  tableName: string;
  rowName: string;
  cssClass: string;
  rowCssClass: string;
  bodyClassName: string;
  columns: ColumnConfig[];
  gridTemplate: string;
  supportsAddColumn?: boolean;
  supportsConflict?: boolean;
  alwaysShowDelete?: boolean;
  tableView?: ComponentType<NodeViewProps & { config: TableConfig }>;
  rowView?: ComponentType<NodeViewProps & { config: TableConfig }>;
};
