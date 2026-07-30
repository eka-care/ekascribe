'use client';

import { useCallback, useEffect, useReducer } from 'react';
import { Trash2 } from 'lucide-react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';

import { AutocompleteCell } from './cells/autocomplete-cell';
import { DropdownCell } from './cells/dropdown-cell';
import { TextCell } from './cells/text-cell';
import type { ColumnConfig, SearchFn, TableConfig } from './types';

interface GenericRowViewProps extends NodeViewProps {
  config: TableConfig;
}

export function GenericRowView({ node, updateAttributes, editor, getPos, config }: GenericRowViewProps) {
  const [, forceRender] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const handler = () => forceRender();
    editor.on('transaction', handler);
    return () => {
      editor.off('transaction', handler);
    };
  }, [editor]);

  const editable = editor.isEditable;
  const attrs = node.attrs as Record<string, string>;

  const handleCellChange = useCallback(
    (key: string, value: string) => updateAttributes({ [key]: value }),
    [updateAttributes]
  );

  const handleDeleteRow = useCallback(() => {
    const pos = getPos();
    if (typeof pos !== 'number') return;
    editor.chain().deleteRange({ from: pos, to: pos + node.nodeSize }).run();
  }, [editor, getPos, node.nodeSize]);

  return (
    <NodeViewWrapper
      className={`${config.rowCssClass} group grid items-stretch`}
      contentEditable={false}
      style={{ gridTemplateColumns: config.gridTemplate }}
      onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
    >
      {config.columns.map((col) => (
        <div key={col.key} className="px-2 py-1.5 border-r border-[#E5E7EB] last:border-r-0 min-w-0">
          <CellRenderer
            column={col}
            value={attrs[col.key] ?? ''}
            onChange={(val) => handleCellChange(col.key, val)}
            disabled={!editable}
          />
        </div>
      ))}

      <div className="flex items-center justify-center">
        {editable && (
          <button
            type="button"
            className="p-1 rounded hover:bg-[#FEF2F2] text-[#9CA3AF] hover:text-[#DC2626] cursor-pointer opacity-0 group-hover:opacity-100 transition-all"
            title="Delete row"
            onClick={(e) => {
              e.stopPropagation();
              handleDeleteRow();
            }}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </NodeViewWrapper>
  );
}

function CellRenderer({
  column,
  value,
  onChange,
  disabled,
}: {
  column: ColumnConfig;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  switch (column.kind) {
    case 'autocomplete':
      return (
        <AutocompleteCell
          value={value}
          placeholder={column.label}
          onChange={onChange}
          disabled={disabled}
          searchFn={column.searchFn as SearchFn}
        />
      );
    case 'dropdown':
      return (
        <DropdownCell
          value={value}
          options={column.options ?? []}
          placeholder={column.label}
          onChange={onChange}
          disabled={disabled}
        />
      );
    case 'text':
      return (
        <TextCell
          value={value}
          placeholder={column.label}
          onChange={onChange}
          disabled={disabled}
        />
      );
  }
}
