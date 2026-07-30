'use client';

import { useCallback, useEffect, useMemo, useReducer } from 'react';
import { Trash2 } from 'lucide-react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';

import type { MedicationColumnDef, MedicationSuggestion } from './medication-columns';
import { AutocompleteCell } from '../table/cells/autocomplete-cell';
import { DropdownCell } from '../table/cells/dropdown-cell';
import { TextCell } from '../table/cells/text-cell';
import { PillsCell } from '../table/cells/pills-cell';
import { buildGridTemplate } from './medication-table-view';
import { getMdbV1DrugsAndLabs } from '@/fetch-client/get-mdb-v1-drugs-and-labs';
import type { SearchFn } from '../table/types';

const drugSearchFn: SearchFn = async (query, docid, signal) => {
  const res = await getMdbV1DrugsAndLabs({ q: query, limit: 8, docid, signal });
  return (res.data?.drugs ?? []).map((d) => ({
    id: d.id,
    name: d.name,
    subtitle: d.generic_name,
  }));
};

const PREDEFINED_KEYS = new Set([
  'drug_name', 'raw_name', 'strength', 'dosage', 'frequency', 'timing',
  'duration', 'route', 'quantity', 'notes', 'suggestions',
  'medication_id', 'match_type', 'original_drug_name',
]);

export function MedicationRowView({ node, updateAttributes, editor, getPos }: NodeViewProps) {
  const editable = editor.isEditable;
  const attrs = node.attrs as Record<string, unknown>;
  const customFields = (attrs.customFields ?? {}) as Record<string, string>;

  // Re-render this row whenever the editor doc changes, so column updates
  // on the parent medicationTable propagate down. Tiptap only re-renders a
  // NodeView when its own node changes, so without this the row keeps
  // showing a stale columns snapshot after add/remove/configure column.
  const [, forceRender] = useReducer((x) => x + 1, 0);
  useEffect(() => {
    const handler = () => forceRender();
    editor.on('transaction', handler);
    return () => {
      editor.off('transaction', handler);
    };
  }, [editor]);

  const parentInfo = findParentMedicationTable(editor, getPos);
  const columns = (parentInfo?.node.attrs.columns ?? []) as MedicationColumnDef[];

  const gridTemplate = useMemo(() => buildGridTemplate(columns), [columns]);

  const getCellValue = useCallback(
    (colKey: string): string => {
      if (PREDEFINED_KEYS.has(colKey)) return (attrs[colKey] as string) ?? '';
      return customFields[colKey] ?? '';
    },
    [attrs, customFields]
  );

  const handleCellChange = useCallback(
    (colKey: string, value: string) => {
      if (PREDEFINED_KEYS.has(colKey)) {
        const update: Record<string, unknown> = { [colKey]: value };
        if (colKey === 'drug_name') {
          const suggestions = (attrs.suggestions ?? []) as MedicationSuggestion[];
          const match = suggestions.find((s) => s.name === value);
          if (match) {
            update.medication_id = match.medication_id;
            update.match_type = 'selected';
          } else {
            update.medication_id = '';
            update.match_type = 'none';
          }
        }
        updateAttributes(update);
      } else {
        updateAttributes({
          customFields: { ...customFields, [colKey]: value },
        });
      }
    },
    [updateAttributes, customFields, attrs.suggestions]
  );

  const handlePillSelect = useCallback(
    (suggestion: MedicationSuggestion) => {
      updateAttributes({
        drug_name: suggestion.name,
        medication_id: suggestion.medication_id,
        match_type: 'selected',
      });
    },
    [updateAttributes]
  );

  const handlePillDeselect = useCallback(() => {
    const originalName = (attrs.original_drug_name as string) ?? '';
    updateAttributes({
      drug_name: originalName,
      medication_id: '',
      match_type: 'none',
    });
  }, [updateAttributes, attrs.original_drug_name]);

  const handleDeleteRow = useCallback(() => {
    const pos = getPos();
    if (typeof pos !== 'number') return;
    editor.chain().deleteRange({ from: pos, to: pos + node.nodeSize }).run();
  }, [editor, getPos, node.nodeSize]);

  return (
    <NodeViewWrapper
      className="medication-row group grid items-stretch"
      contentEditable={false}
      style={{ gridTemplateColumns: gridTemplate }}
      onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
    >
      {columns.map((col) => (
        <div
          key={col.key}
          className="px-2 py-1.5 border-r border-[#E5E7EB] last:border-r-0 min-w-0"
        >
          {col.kind === 'pills' ? (
            <PillsCell
              suggestions={(attrs.suggestions ?? []) as MedicationSuggestion[]}
              selectedMedicationId={(attrs.medication_id as string) ?? ''}
              onSelect={handlePillSelect}
              onDeselect={handlePillDeselect}
              disabled={!editable}
            />
          ) : (
            <CellRenderer
              column={col}
              value={getCellValue(col.key)}
              onChange={(val) => handleCellChange(col.key, val)}
              disabled={!editable}
            />
          )}
        </div>
      ))}

      {/* Delete-row slot — always reserved so column widths don't shift. */}
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
  column: MedicationColumnDef;
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
          searchFn={drugSearchFn}
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

function findParentMedicationTable(
  editor: NodeViewProps['editor'],
  getPos: NodeViewProps['getPos']
) {
  const pos = getPos();
  if (typeof pos !== 'number') return null;
  const resolved = editor.state.doc.resolve(pos);
  for (let depth = resolved.depth; depth >= 0; depth--) {
    const node = resolved.node(depth);
    if (node.type.name === 'medicationTable') {
      return { node, pos: depth === 0 ? 0 : resolved.before(depth) };
    }
  }
  return null;
}
