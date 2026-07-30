'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Minus, Plus } from 'lucide-react';
import type { Editor } from '@tiptap/react';

interface TableDimensions {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface HoveredCellInfo {
  colIndex: number;
  rowIndex: number;
  cellLeft: number;
  cellTop: number;
  cellWidth: number;
  cellHeight: number;
}

interface TableAddButtonsProps {
  editor: Editor | null;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

const BUTTON_THICKNESS = 18;
const GAP = 4;
const REMOVE_SIZE = 16;

const TableAddButtons = ({ editor, containerRef }: TableAddButtonsProps) => {
  const [hoveredTable, setHoveredTable] = useState<HTMLTableElement | null>(null);
  const [dims, setDims] = useState<TableDimensions | null>(null);
  const [hoveredCell, setHoveredCell] = useState<HoveredCellInfo | null>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const measureTable = useCallback(
    (table: HTMLTableElement) => {
      const container = containerRef.current;
      if (!container) return;

      const tableRect = table.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();

      setDims({
        top: tableRect.top - containerRect.top,
        left: tableRect.left - containerRect.left,
        width: tableRect.width,
        height: tableRect.height,
      });
    },
    [containerRef]
  );

  const measureCell = useCallback(
    (cell: HTMLElement, table: HTMLTableElement) => {
      const container = containerRef.current;
      if (!container) return;

      const row = cell.closest('tr');
      if (!row) return;

      const rows = Array.from(table.querySelectorAll('tr'));
      const cells = Array.from(row.querySelectorAll('th, td'));

      const cellRect = cell.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();

      setHoveredCell({
        colIndex: cells.indexOf(cell),
        rowIndex: rows.indexOf(row),
        cellLeft: cellRect.left - containerRect.left,
        cellTop: cellRect.top - containerRect.top,
        cellWidth: cellRect.width,
        cellHeight: cellRect.height,
      });
    },
    [containerRef]
  );

  const clearHideTimeout = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  }, []);

  const scheduleHide = useCallback(() => {
    clearHideTimeout();
    hideTimeoutRef.current = setTimeout(() => {
      setHoveredTable(null);
      setDims(null);
      setHoveredCell(null);
    }, 150);
  }, [clearHideTimeout]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMouseOver = (e: MouseEvent) => {
      const table = (e.target as HTMLElement).closest(
        '.tiptap table'
      ) as HTMLTableElement | null;
      if (table) {
        clearHideTimeout();
        setHoveredTable(table);
        measureTable(table);

        const cell = (e.target as HTMLElement).closest('th, td') as HTMLElement | null;
        if (cell) measureCell(cell, table);
      }
    };

    const handleMouseOut = (e: MouseEvent) => {
      const related = e.relatedTarget as HTMLElement | null;
      if (
        !related?.closest('.tiptap table') &&
        !related?.closest('.table-add-btn')
      ) {
        scheduleHide();
      }
    };

    container.addEventListener('mouseover', handleMouseOver);
    container.addEventListener('mouseout', handleMouseOut);

    return () => {
      container.removeEventListener('mouseover', handleMouseOver);
      container.removeEventListener('mouseout', handleMouseOut);
      clearHideTimeout();
    };
  }, [containerRef, measureTable, measureCell, scheduleHide, clearHideTimeout]);

  const focusCellAt = useCallback(
    (table: HTMLTableElement, rowIdx: number, colIdx: number) => {
      if (!editor) return;
      const row = table.querySelectorAll('tr')[rowIdx];
      if (!row) return;
      const cell = row.querySelectorAll('th, td')[colIdx] as HTMLElement | null;
      if (!cell) return;
      const pos = editor.view.posAtDOM(cell, 0);
      editor.chain().focus().setTextSelection(pos).run();
    },
    [editor]
  );

  const remeasureTable = useCallback(() => {
    requestAnimationFrame(() => {
      const table = containerRef.current?.querySelector(
        '.tiptap table'
      ) as HTMLTableElement | null;
      if (table) {
        setHoveredTable(table);
        measureTable(table);
      } else {
        setHoveredTable(null);
        setDims(null);
      }
      setHoveredCell(null);
    });
  }, [containerRef, measureTable]);

  const addColumnOrRow = useCallback(
    (type: 'column' | 'row') => {
      if (!editor || !hoveredTable) return;

      const rows = hoveredTable.querySelectorAll('tr');
      if (!rows.length) return;

      if (type === 'column') {
        const cells = rows[0].querySelectorAll('th, td');
        focusCellAt(hoveredTable, 0, cells.length - 1);
        editor.chain().addColumnAfter().run();
      } else {
        focusCellAt(hoveredTable, rows.length - 1, 0);
        editor.chain().addRowAfter().run();
      }

      remeasureTable();
    },
    [editor, hoveredTable, focusCellAt, remeasureTable]
  );

  const removeColumnOrRow = useCallback(
    (type: 'column' | 'row') => {
      if (!editor || !hoveredTable || !hoveredCell) return;

      focusCellAt(hoveredTable, hoveredCell.rowIndex, hoveredCell.colIndex);

      if (type === 'column') {
        const isOnlyColumn = hoveredTable.querySelector('tr')?.querySelectorAll('th, td').length === 1;
        if (isOnlyColumn) {
          editor.chain().deleteTable().run();
        } else {
          editor.chain().deleteColumn().run();
        }
      } else {
        editor.chain().deleteRow().run();
      }

      remeasureTable();
    },
    [editor, hoveredTable, hoveredCell, focusCellAt, remeasureTable]
  );

  if (!dims) return null;

  const totalCols = hoveredTable?.querySelector('tr')?.querySelectorAll('th, td').length ?? 0;
  const totalRows = hoveredTable?.querySelectorAll('tr').length ?? 0;
  const canDeleteCol = hoveredCell && totalCols > 0;
  const canDeleteRow = hoveredCell && hoveredCell.rowIndex > 0 && totalRows > 1;

  return (
    <>
      {/* Add column — right edge of the table */}
      <button
        className="table-add-btn absolute z-10 flex items-center justify-center rounded border border-border bg-white text-muted-foreground hover:bg-accent transition-colors cursor-pointer"
        style={{
          top: dims.top,
          left: dims.left + dims.width + GAP,
          width: BUTTON_THICKNESS,
          height: dims.height,
        }}
        title="Add column"
        onMouseEnter={clearHideTimeout}
        onMouseLeave={scheduleHide}
        onMouseDown={(e) => {
          e.preventDefault();
          addColumnOrRow('column');
        }}
      >
        <Plus className="w-3 h-3" />
      </button>
      {/* Add row — bottom edge, full table width */}
      <button
        className="table-add-btn absolute z-10 flex items-center justify-center rounded border border-border bg-white text-muted-foreground hover:bg-accent transition-colors cursor-pointer"
        style={{
          top: dims.top + dims.height + GAP,
          left: dims.left,
          width: dims.width,
          height: BUTTON_THICKNESS,
        }}
        title="Add row"
        onMouseEnter={clearHideTimeout}
        onMouseLeave={scheduleHide}
        onMouseDown={(e) => {
          e.preventDefault();
          addColumnOrRow('row');
        }}
      >
        <Plus className="w-3 h-3" />
      </button>

      {/* Remove column — small circle at top-right of hovered header cell */}
      {canDeleteCol && hoveredCell.rowIndex === 0 && (
        <button
          className="table-add-btn absolute z-20 flex items-center justify-center rounded-full bg-white border border-[#E5E7EB] text-[#9CA3AF] hover:bg-[#FEF2F2] hover:border-[#FECACA] hover:text-[#DC2626] transition-colors cursor-pointer shadow-sm"
          style={{
            top: hoveredCell.cellTop - REMOVE_SIZE / 2,
            left: hoveredCell.cellLeft + hoveredCell.cellWidth - REMOVE_SIZE / 2,
            width: REMOVE_SIZE,
            height: REMOVE_SIZE,
          }}
          title="Delete column"
          onMouseEnter={clearHideTimeout}
          onMouseLeave={scheduleHide}
          onMouseDown={(e) => {
            e.preventDefault();
            removeColumnOrRow('column');
          }}
        >
          <Minus className="w-2.5 h-2.5" />
        </button>
      )}

      {/* Remove row — small circle at left edge of hovered data row */}
      {canDeleteRow && (
        <button
          className="table-add-btn absolute z-20 flex items-center justify-center rounded-full bg-white border border-[#E5E7EB] text-[#9CA3AF] hover:bg-[#FEF2F2] hover:border-[#FECACA] hover:text-[#DC2626] transition-colors cursor-pointer shadow-sm"
          style={{
            top: hoveredCell.cellTop + hoveredCell.cellHeight / 2 - REMOVE_SIZE / 2,
            left: dims.left - REMOVE_SIZE / 2,
            width: REMOVE_SIZE,
            height: REMOVE_SIZE,
          }}
          title="Remove row"
          onMouseEnter={clearHideTimeout}
          onMouseLeave={scheduleHide}
          onMouseDown={(e) => {
            e.preventDefault();
            removeColumnOrRow('row');
          }}
        >
          <Minus className="w-2.5 h-2.5" />
        </button>
      )}
    </>
  );
};

export default TableAddButtons;
