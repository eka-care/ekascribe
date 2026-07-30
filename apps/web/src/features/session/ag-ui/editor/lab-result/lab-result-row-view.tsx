'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';

import { getOrderedColumns } from '../table/column-order';
import { useTableUIState } from '../table/table-ui-store';
import { useEditorEditable, useEditorSignal } from '../table/use-editor-signal';
import { normalizeCustomColumns } from '../table/custom-columns';
import { NO_OPTIONS, RowCell, type RowCellHandlers } from './row-cell';
import { RowActionsCell } from './row-actions-cell';
import type { ConflictValue, CustomColumn, TableConfig, TrendEntry } from '../table/types';

const EMPTY_TREND: TrendEntry[] = [];

interface LabResultRowViewProps extends NodeViewProps {
  config: TableConfig;
}

interface ParentTableAttrs {
  sectionKey: string;
  columns: CustomColumn[];
  hiddenColumns: string[];
  columnOrder: string[];
}

const EMPTY_PARENT_TABLE_ATTRS: ParentTableAttrs = {
  sectionKey: '',
  columns: [],
  hiddenColumns: [],
  columnOrder: [],
};

function findDuplicateRowId(
  editor: NodeViewProps['editor'],
  getPos: NodeViewProps['getPos'],
  tableName: string,
  ekaIdAttr: string | undefined,
  idAttr: string | undefined,
  candidateId: string
): boolean {
  const pos = getPos();
  if (typeof pos !== 'number') return false;
  const resolved = editor.state.doc.resolve(pos);
  for (let depth = resolved.depth; depth >= 0; depth--) {
    const tableNode = resolved.node(depth);
    if (tableNode.type.name !== tableName) continue;
    const contentStart = resolved.start(depth);
    let duplicate = false;
    tableNode.forEach((child, offset) => {
      if (duplicate) return;
      const childPos = contentStart + offset;
      if (childPos === pos) return;
      const ekaVal = ekaIdAttr ? (child.attrs[ekaIdAttr] as string | undefined) : undefined;
      const idVal = idAttr ? (child.attrs[idAttr] as string | undefined) : undefined;
      if ((ekaVal && ekaVal === candidateId) || (idVal && idVal === candidateId)) duplicate = true;
    });
    return duplicate;
  }
  return false;
}

function findParentTableAttrs(
  editor: NodeViewProps['editor'],
  getPos: NodeViewProps['getPos'],
  tableName: string
): Record<string, unknown> | null {
  const pos = getPos();
  if (typeof pos !== 'number') return null;
  const resolved = editor.state.doc.resolve(pos);
  for (let depth = resolved.depth; depth >= 0; depth--) {
    const node = resolved.node(depth);
    if (node.type.name === tableName) return node.attrs;
  }
  return null;
}

function toParentTableAttrs(raw: Record<string, unknown> | null): ParentTableAttrs {
  if (!raw) return EMPTY_PARENT_TABLE_ATTRS;
  return {
    sectionKey: (raw.sectionKey as string) ?? '',
    columns: normalizeCustomColumns(raw.columns),
    hiddenColumns: (raw.hiddenColumns as string[]) ?? [],
    columnOrder: (raw.columnOrder as string[]) ?? [],
  };
}

export function LabResultRowView({ node, updateAttributes, editor, getPos, config }: LabResultRowViewProps) {
  const [isRowDeleteHovered, setIsRowDeleteHovered] = useState(false);

  const editable = useEditorEditable(editor);
  const attrs = node.attrs as Record<string, unknown>;

  const rawParentAttrs = useEditorSignal(editor, () =>
    config.supportsAddColumn ? findParentTableAttrs(editor, getPos, config.tableName) : null
  );
  const parentTableAttrs = useMemo(() => toParentTableAttrs(rawParentAttrs), [rawParentAttrs]);

  // Mid-drag the header publishes the previewed order and the lifted column, so
  // this row's cells move and dim in step with it instead of waiting for the drop.
  const ui = useTableUIState(parentTableAttrs.sectionKey);
  const orderedColumns = useMemo(
    () =>
      getOrderedColumns(config, {
        customColumns: parentTableAttrs.columns,
        hiddenColumns: parentTableAttrs.hiddenColumns,
        columnOrder: ui.dragOrder ?? parentTableAttrs.columnOrder,
      }),
    [config, parentTableAttrs, ui.dragOrder]
  );
  const customFields = (attrs.customFields ?? {}) as Record<string, string>;
  const trend = (attrs.trend ?? []) as TrendEntry[];
  const pendingConflict = config.supportsConflict ? ((attrs.pendingConflict ?? null) as ConflictValue | null) : null;

  const [duplicateError, setDuplicateError] = useState<{ colKey: string; message: string } | null>(null);

  // Cell callbacks are built once and never change identity, so a memoized cell
  // only re-renders when its own value does. Everything they need is read
  // through this ref at call time rather than captured.
  const latest = useRef({ updateAttributes, attrs, customFields, trend, pendingConflict, editor, getPos, config });
  latest.current = { updateAttributes, attrs, customFields, trend, pendingConflict, editor, getPos, config };

  const columnByKey = useMemo(
    () => new Map(config.columns.map((col) => [col.key, col])),
    [config]
  );

  const handlers = useMemo<RowCellHandlers>(
    () => ({
      onChange: (columnKey, value) => {
        const { config: cfg, updateAttributes: update } = latest.current;
        const col = cfg.columns.find((c) => c.key === columnKey);
        if (cfg.supportsConflict && col?.kind === 'value') {
          update({ [columnKey]: value, date: '' });
        } else {
          update({ [columnKey]: value });
        }
      },

      onCustomFieldChange: (columnKey, value) => {
        const { customFields: fields, updateAttributes: update } = latest.current;
        update({ customFields: { ...fields, [columnKey]: value } });
      },

      onAutocompleteChange: (columnKey, value) => {
        const { config: cfg, updateAttributes: update } = latest.current;
        const col = cfg.columns.find((c) => c.key === columnKey);
        const patch: Record<string, unknown> = { [columnKey]: value };
        if (col?.onSelect?.idAttr) patch[col.onSelect.idAttr] = '';
        if (col?.onSelect?.ekaIdAttr) patch[col.onSelect.ekaIdAttr] = '';
        if (col?.onSelect?.unitsAttr) patch[col.onSelect.unitsAttr] = [];
        update(patch);
        setDuplicateError((prev) => (prev?.colKey === columnKey ? null : prev));
      },

      onAutocompleteSelect: (columnKey, item) => {
        const { config: cfg, updateAttributes: update, editor: ed, getPos: pos } = latest.current;
        const col = cfg.columns.find((c) => c.key === columnKey);
        if (!col) return;
        if (col.onSelect?.ekaIdAttr || col.onSelect?.idAttr) {
          const isDuplicate = findDuplicateRowId(
            ed,
            pos,
            cfg.tableName,
            col.onSelect.ekaIdAttr,
            col.onSelect.idAttr,
            item.id
          );
          if (isDuplicate) {
            setDuplicateError({ colKey: columnKey, message: `${item.name} is already added to this table` });
            return;
          }
        }
        setDuplicateError((prev) => (prev?.colKey === columnKey ? null : prev));
        const patch: Record<string, unknown> = {};
        if (col.onSelect?.idAttr) patch[col.onSelect.idAttr] = item.id;
        if (col.onSelect?.ekaIdAttr) patch[col.onSelect.ekaIdAttr] = item.id;
        if (col.onSelect?.unitsAttr) {
          const units = item.units ?? [];
          patch[col.onSelect.unitsAttr] = units;
          if (col.onSelect.autoFillUnitColumnKey) {
            patch[col.onSelect.autoFillUnitColumnKey] = units[0] ?? '';
          }
        }
        if (Object.keys(patch).length > 0) update(patch);
      },

      onOverride: () => {
        const { config: cfg, attrs: rowAttrs, trend: rowTrend, pendingConflict: conflict, updateAttributes: update } =
          latest.current;
        if (!conflict) return;
        const valueCol = cfg.columns.find((c) => c.kind === 'value');
        if (!valueCol) return;
        update({
          [valueCol.key]: conflict.value,
          unit: conflict.unit,
          date: conflict.date ?? '',
          trend: [
            {
              value: (rowAttrs[valueCol.key] as string) ?? '',
              unit: (rowAttrs.unit as string) ?? '',
              date: (rowAttrs.date as string) ?? '',
            },
            ...rowTrend,
          ],
          pendingConflict: null,
        });
      },

      onCancelConflict: () => latest.current.updateAttributes({ pendingConflict: null }),
    }),
    []
  );

  const handleDeleteRow = useCallback(() => {
    const pos = getPos();
    if (typeof pos !== 'number') return;
    editor.chain().deleteRange({ from: pos, to: pos + node.nodeSize }).run();
  }, [editor, getPos, node.nodeSize]);

  return (
    <NodeViewWrapper
      className={
        `${config.rowCssClass} group grid items-stretch [&>:nth-last-child(2)]:border-r-0 ` +
        (config.supportsAddColumn ? 'border-b border-[#E5E7EB] ' : '') +
        (isRowDeleteHovered ? 'bg-[#FFEBED]' : '')
      }
      contentEditable={false}
      style={{
        gridTemplateColumns: config.supportsAddColumn ? 'subgrid' : config.gridTemplate,
        gridColumn: config.supportsAddColumn ? '1 / -1' : undefined,
      }}
      onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
    >
      {orderedColumns.map((oc) => {
        const column = oc.origin === 'builtin' ? (columnByKey.get(oc.key) ?? null) : null;
        const linked = column?.optionsFromAttr ? (attrs[column.optionsFromAttr] as string[] | undefined) : undefined;
        return (
          <RowCell
            key={oc.key}
            columnKey={oc.key}
            column={column}
            value={(column ? (attrs[oc.key] as string) : customFields[oc.key]) ?? ''}
            options={linked?.length ? linked : (column?.options ?? NO_OPTIONS)}
            pendingConflict={column?.kind === 'value' ? pendingConflict : null}
            errorMessage={duplicateError?.colKey === oc.key ? duplicateError.message : null}
            disabled={!editable}
            isColumnDragging={ui.dragActiveKey === oc.key}
            isColumnDeleteHovered={ui.deleteHoverKey === oc.key}
            isRowDeleteHovered={isRowDeleteHovered}
            handlers={handlers}
          />
        );
      })}

      <RowActionsCell
        editor={editor}
        editable={editable}
        alwaysShowDelete={Boolean(config.alwaysShowDelete)}
        isRowDeleteHovered={isRowDeleteHovered}
        trend={config.supportsConflict ? trend : EMPTY_TREND}
        onDeleteHoverChange={setIsRowDeleteHovered}
        onDelete={handleDeleteRow}
      />
    </NodeViewWrapper>
  );
}
