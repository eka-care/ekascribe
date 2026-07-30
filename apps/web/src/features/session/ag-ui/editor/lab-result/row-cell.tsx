'use client';

import { memo, useCallback } from 'react';
import { ArrowRightLeft, X } from 'lucide-react';

import { AutocompleteCell } from '../table/cells/autocomplete-cell';
import { DropdownCell } from '../table/cells/dropdown-cell';
import { TextCell } from '../table/cells/text-cell';
import type { ColumnConfig, ConflictValue, SearchFn, SearchResult } from '../table/types';

export const NO_OPTIONS: string[] = [];

export type RowCellHandlers = {
  onChange: (columnKey: string, value: string) => void;
  onCustomFieldChange: (columnKey: string, value: string) => void;
  onAutocompleteChange: (columnKey: string, value: string) => void;
  onAutocompleteSelect: (columnKey: string, item: SearchResult) => void;
  onOverride: () => void;
  onCancelConflict: () => void;
};

interface RowCellProps {
  columnKey: string;
  column: ColumnConfig | null;
  value: string;
  options: string[];
  pendingConflict: ConflictValue | null;
  errorMessage: string | null;
  disabled: boolean;
  isColumnDragging: boolean;
  isColumnDeleteHovered: boolean;
  isRowDeleteHovered: boolean;
  handlers: RowCellHandlers;
}

export const RowCell = memo(function RowCell({
  columnKey,
  column,
  value,
  options,
  pendingConflict,
  errorMessage,
  disabled,
  isColumnDragging,
  isColumnDeleteHovered,
  isRowDeleteHovered,
  handlers,
}: RowCellProps) {
  const handleChange = useCallback(
    (next: string) => handlers.onChange(columnKey, next),
    [handlers, columnKey]
  );
  const handleCustomFieldChange = useCallback(
    (next: string) => handlers.onCustomFieldChange(columnKey, next),
    [handlers, columnKey]
  );
  const handleAutocompleteChange = useCallback(
    (next: string) => handlers.onAutocompleteChange(columnKey, next),
    [handlers, columnKey]
  );
  const handleAutocompleteSelect = useCallback(
    (item: SearchResult) => handlers.onAutocompleteSelect(columnKey, item),
    [handlers, columnKey]
  );

  const base = 'flex items-start px-2 py-1.5 border-r border-[#E5E7EB] last:border-r-0 min-w-0 ';

  if (!column) {
    return (
      <div
        data-col-cell
        data-col-key={columnKey}
        className={
          base +
          (isColumnDragging ? 'opacity-70 bg-[#F3F4F6] ' : '') +
          (isColumnDeleteHovered ? 'bg-[#FFEBED]' : '')
        }
      >
        <TextCell value={value} onChange={handleCustomFieldChange} disabled={disabled} />
      </div>
    );
  }

  const hasConflict = Boolean(pendingConflict);
  const isDeleteHovered = isColumnDeleteHovered || isRowDeleteHovered;

  return (
    <div
      data-col-cell
      data-col-key={columnKey}
      className={
        base +
        (errorMessage ? 'flex-col ' : '') +
        (isColumnDragging ? 'opacity-70 ' : '') +
        (isDeleteHovered
          ? 'bg-[#FFEBED] '
          : isColumnDragging
            ? 'bg-[#F3F4F6] '
            : hasConflict
              ? 'bg-[#FFFAEB] '
              : '')
      }
    >
      {pendingConflict ? (
        <ConflictCell
          value={value}
          pendingConflict={pendingConflict}
          disabled={disabled}
          onOverride={handlers.onOverride}
          onCancelConflict={handlers.onCancelConflict}
        />
      ) : (
        <CellInput
          column={column}
          value={value}
          options={options}
          disabled={disabled}
          onChange={handleChange}
          onAutocompleteChange={handleAutocompleteChange}
          onAutocompleteSelect={handleAutocompleteSelect}
        />
      )}
      {errorMessage && <span className="mt-0.5 text-xs text-[#DC2626]">{errorMessage}</span>}
    </div>
  );
});

function CellInput({
  column,
  value,
  options,
  disabled,
  onChange,
  onAutocompleteChange,
  onAutocompleteSelect,
}: {
  column: ColumnConfig;
  value: string;
  options: string[];
  disabled: boolean;
  onChange: (value: string) => void;
  onAutocompleteChange: (value: string) => void;
  onAutocompleteSelect: (item: SearchResult) => void;
}) {
  switch (column.kind) {
    case 'autocomplete':
      return (
        <AutocompleteCell
          value={value}
          placeholder={column.label}
          onChange={onAutocompleteChange}
          onSelect={onAutocompleteSelect}
          disabled={disabled}
          searchFn={column.searchFn as SearchFn}
        />
      );
    case 'dropdown':
      return (
        <DropdownCell
          value={value}
          options={options}
          placeholder={column.label}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case 'text':
    case 'value':
      return <TextCell value={value} placeholder={column.label} onChange={onChange} disabled={disabled} />;
  }
}

function ConflictCell({
  value,
  pendingConflict,
  disabled,
  onOverride,
  onCancelConflict,
}: {
  value: string;
  pendingConflict: ConflictValue;
  disabled: boolean;
  onOverride: () => void;
  onCancelConflict: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-2 w-full min-w-0 overflow-x-auto">
      <div className="flex flex-col items-start shrink-0">
        <span className="text-[10px] font-semibold text-[#999999] uppercase tracking-wide">Current</span>
        <span data-print-value={value} className="whitespace-nowrap text-sm text-[#1A1A1A] leading-5">
          {value}
        </span>
      </div>
      <div className="flex flex-col items-start shrink-0">
        <span className="text-[10px] font-semibold text-[#999999] uppercase tracking-wide whitespace-nowrap">
          Replace with
        </span>
        <div className="flex items-center gap-1">
          {!disabled && (
            <button
              type="button"
              className="flex items-center gap-1 min-w-[64px] justify-center px-1.5 py-0.5 rounded-lg border border-[#D1D1D1] bg-white hover:bg-[#F5F5F5] transition-colors cursor-pointer"
              title="Replace with new value"
              onClick={(e) => {
                e.stopPropagation();
                onOverride();
              }}
            >
              <ArrowRightLeft className="w-4 h-4 shrink-0 text-[#215FFF]" />
              <span className="whitespace-nowrap text-sm font-medium text-[#215FFF]">{pendingConflict.value}</span>
            </button>
          )}
          {!disabled && (
            <button
              type="button"
              className="p-0.5 rounded-lg text-[#6B7280] hover:bg-[#F5F5F5] transition-colors cursor-pointer"
              title="Keep current value"
              onClick={(e) => {
                e.stopPropagation();
                onCancelConflict();
              }}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
