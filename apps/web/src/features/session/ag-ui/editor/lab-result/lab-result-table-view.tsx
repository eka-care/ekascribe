'use client';

import { useCallback } from 'react';
import { Plus } from 'lucide-react';
import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { DndContext, DragOverlay, closestCenter } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { restrictToHorizontalAxis } from '@dnd-kit/modifiers';
import { closeHistory } from '@tiptap/pm/history';

import { getOrderedColumns } from '../table/column-order';
import { normalizeCustomColumns } from '../table/custom-columns';
import { setTableUIState, useTableUIState } from '../table/table-ui-store';
import { useColumnDnd } from '../table/use-column-dnd';
import { useEditorEditable } from '../table/use-editor-signal';
import { useTableLayout } from '../table/use-table-layout';
import type { TableConfig } from '../table/types';
import { ColumnHeaderCell } from './column-header-cell';
import { removeColumnPatch } from './column-actions';

interface LabResultTableViewProps extends NodeViewProps {
  config: TableConfig;
}

export function LabResultTableView({
  node,
  updateAttributes,
  editor,
  getPos,
  config,
}: LabResultTableViewProps) {
  const editable = useEditorEditable(editor);

  const columns = config.supportsAddColumn ? normalizeCustomColumns(node.attrs.columns) : [];
  const hiddenColumns = config.supportsAddColumn ? ((node.attrs.hiddenColumns as string[]) ?? []) : [];
  const columnOrder = config.supportsAddColumn ? ((node.attrs.columnOrder as string[]) ?? []) : [];
  const orderedColumns = getOrderedColumns(config, { customColumns: columns, hiddenColumns, columnOrder });
  const orderedKeys = orderedColumns.map((oc) => oc.key);

  // Header and rows read the same transient state from the same place, so a
  // whole column previews a drag or a pending delete together.
  const tableId = (node.attrs.sectionKey as string) ?? '';
  const ui = useTableUIState(tableId);

  const commitAttrs = useCallback(
    (patch: Record<string, unknown>) => {
      const pos = getPos();
      if (typeof pos !== 'number') return;
      const tr = editor.state.tr;
      Object.entries(patch).forEach(([name, value]) => tr.setNodeAttribute(pos, name, value));
      closeHistory(tr);
      editor.view.dispatch(tr);
    },
    [editor, getPos]
  );

  const commitWidths = useCallback(
    (columnWidths: Record<string, number>) => commitAttrs({ columnWidths }),
    [commitAttrs]
  );
  const commitOrder = useCallback(
    (order: string[]) => commitAttrs({ columnOrder: order }),
    [commitAttrs]
  );

  const { scrollRef, actionsRef, resize } = useTableLayout({
    tableId,
    orderedKeys,
    storedWidths: node.attrs.columnWidths,
    enabled: Boolean(config.supportsAddColumn),
    onCommitWidths: commitWidths,
  });

  const dnd = useColumnDnd({ tableId, orderedKeys, scrollRef, onCommitOrder: commitOrder });

  const locked = resize.isResizing || ui.dragActiveKey !== null;

  const handleAddRow = useCallback(() => {
    const pos = getPos();
    if (typeof pos !== 'number') return;
    editor.chain().insertContentAt(pos + node.nodeSize - 1, { type: config.rowName }).run();
  }, [editor, getPos, node.nodeSize, config.rowName]);

  const handleRenameColumn = useCallback(
    (key: string, label: string) => {
      updateAttributes({ columns: columns.map((c) => (c.key === key ? { ...c, label } : c)) });
    },
    [columns, updateAttributes]
  );

  const handleDeleteColumn = useCallback(
    (key: string) => {
      setTableUIState(tableId, { deleteHoverKey: null });
      commitAttrs(removeColumnPatch(node.attrs, key));
    },
    [commitAttrs, node.attrs, tableId]
  );

  const handleDeleteHoverStart = useCallback(
    (key: string) => setTableUIState(tableId, { deleteHoverKey: key }),
    [tableId]
  );
  const handleDeleteHoverEnd = useCallback(
    () => setTableUIState(tableId, { deleteHoverKey: null }),
    [tableId]
  );

  return (
    <NodeViewWrapper className={`${config.cssClass} my-2 isolate`} contentEditable={false}>
      <div onMouseDown={(e) => e.stopPropagation()}>
        <div
          ref={scrollRef}
          className={
            'relative border border-[#E5E7EB] rounded-lg bg-white overflow-x-auto overflow-y-hidden' +
            (config.supportsAddColumn ? ' grid w-full' : '')
          }
        >
          <div className="pointer-events-none absolute inset-y-0 left-0 z-20 w-0 [.is-scrolled_&]:shadow-[6px_0_8px_-6px_rgba(15,23,42,0.15)]" />
          <div
            className="grid items-stretch bg-[#F9FAFB] border-b border-[#E5E7EB] rounded-t-lg"
            style={
              config.supportsAddColumn
                ? { gridTemplateColumns: 'subgrid', gridColumn: '1 / -1' }
                : { gridTemplateColumns: config.gridTemplate }
            }
          >
            <DndContext
              sensors={dnd.sensors}
              collisionDetection={closestCenter}
              modifiers={[restrictToHorizontalAxis]}
              onDragStart={dnd.onDragStart}
              onDragOver={dnd.onDragOver}
              onDragEnd={dnd.onDragEnd}
              onDragCancel={dnd.onDragCancel}
            >
              <SortableContext items={orderedKeys} strategy={horizontalListSortingStrategy}>
                {orderedColumns.map((oc, index) => (
                  <ColumnHeaderCell
                    key={oc.key}
                    colKey={oc.key}
                    label={oc.column.label}
                    isCustom={oc.origin === 'custom'}
                    editable={editable}
                    locked={locked}
                    isResizeActive={resize.activeKey === oc.key}
                    isDeleteHovered={ui.deleteHoverKey === oc.key}
                    isLastColumn={index === orderedColumns.length - 1}
                    resizeHandleProps={resize.getHandleProps(oc.key)}
                    onRename={handleRenameColumn}
                    onDelete={handleDeleteColumn}
                    onDeleteHoverStart={handleDeleteHoverStart}
                    onDeleteHoverEnd={handleDeleteHoverEnd}
                  />
                ))}
              </SortableContext>
              <DragOverlay modifiers={[restrictToHorizontalAxis]}>
                {dnd.overlaySnapshot && (
                  <div
                    style={{ width: dnd.overlaySnapshot.width }}
                    className="shadow-lg cursor-grabbing"
                    dangerouslySetInnerHTML={{ __html: dnd.overlaySnapshot.html }}
                  />
                )}
              </DragOverlay>
            </DndContext>

            <div
              ref={actionsRef}
              className="sticky right-0 z-10 bg-[#F9FAFB] border-l border-[#E5E7EB] will-change-transform [.is-scrolled_&]:shadow-[-6px_0_8px_-6px_rgba(15,23,42,0.15)]"
            />
          </div>

          <NodeViewContent
            className={
              config.supportsAddColumn
                ? `${config.bodyClassName} contents`
                : `${config.bodyClassName} block`
            }
          />
        </div>
      </div>

      <div className="flex items-stretch gap-1 mt-1">
        <button
          type="button"
          className={
            'flex-1 min-w-0 flex items-center justify-center h-[18px] rounded transition-colors ' +
            (editable
              ? 'border border-[#E5E7EB] bg-white text-[#9CA3AF] hover:bg-[#F9FAFB] hover:text-[#6B7280] cursor-pointer'
              : 'border border-transparent bg-transparent text-transparent pointer-events-none')
          }
          title="Add row"
          disabled={!editable}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleAddRow();
          }}
        >
          <Plus className="w-3 h-3" />
        </button>
        <div className="w-[18px]" />
      </div>
    </NodeViewWrapper>
  );
}
