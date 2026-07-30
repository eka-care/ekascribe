'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Minus, Plus } from 'lucide-react';
import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from '@tiptap/react';

import type { MedicationColumnDef } from './medication-columns';
import { DEFAULT_COLUMN_WIDTH, PREDEFINED_MEDICATION_COLUMNS, getColumnDef } from './medication-columns';
import { InlineColumnPicker } from './add-column-header';

const PENDING_KEY_PREFIX = '__pending_';
const SCROLL_STEP = 160;

function makePendingColumn(): MedicationColumnDef {
  return {
    key: `${PENDING_KEY_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    label: '',
    kind: 'text',
  };
}

function getColWidth(col: MedicationColumnDef): number {
  return getColumnDef(col.key)?.width ?? col.width ?? DEFAULT_COLUMN_WIDTH;
}

function getTotalMinWidth(columns: MedicationColumnDef[]) {
  return columns.reduce((sum, col) => sum + getColWidth(col), 0) + 32;
}

export function buildGridTemplate(columns: MedicationColumnDef[]) {
  const cols = columns
    .map((col) => {
      const w = getColWidth(col);
      return `minmax(${w}px, 1fr)`;
    })
    .join(' ');
  return `${cols} 32px`;
}

export function MedicationTableView({ node, updateAttributes, editor, getPos }: NodeViewProps) {
  const [, forceRender] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const handler = () => forceRender();
    editor.on('transaction', handler);
    return () => {
      editor.off('transaction', handler);
    };
  }, [editor]);

  const editable = editor.isEditable;
  const columns = (node.attrs.columns ?? []) as MedicationColumnDef[];
  const [hoveredColKey, setHoveredColKey] = useState<string | null>(null);
  const [hovered, setHovered] = useState(false);

  // Scroll state
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const prevColCount = useRef(columns.length);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScrollState();
    el.addEventListener('scroll', updateScrollState, { passive: true });
    const observer = new ResizeObserver(updateScrollState);
    observer.observe(el);
    return () => {
      el.removeEventListener('scroll', updateScrollState);
      observer.disconnect();
    };
  }, [updateScrollState, columns.length]);

  // Scroll to end when a new column is added
  useEffect(() => {
    if (columns.length > prevColCount.current) {
      const el = scrollRef.current;
      if (el) {
        requestAnimationFrame(() => {
          el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' });
        });
      }
    }
    prevColCount.current = columns.length;
  }, [columns.length]);

  const handleScrollLeft = useCallback(() => {
    scrollRef.current?.scrollBy({ left: -SCROLL_STEP, behavior: 'smooth' });
  }, []);

  const handleScrollRight = useCallback(() => {
    scrollRef.current?.scrollBy({ left: SCROLL_STEP, behavior: 'smooth' });
  }, []);

  const activeKeys = useMemo(
    () => new Set(columns.filter((c) => !c.key.startsWith(PENDING_KEY_PREFIX)).map((c) => c.key)),
    [columns]
  );

  const availablePredefined = useMemo(
    () => PREDEFINED_MEDICATION_COLUMNS.filter((c) => !activeKeys.has(c.key)),
    [activeKeys]
  );

  const totalMinWidth = useMemo(() => getTotalMinWidth(columns), [columns]);
  const gridTemplate = useMemo(() => buildGridTemplate(columns), [columns]);

  const handleConfigurePendingColumn = useCallback(
    (pendingKey: string, colDef: MedicationColumnDef) => {
      updateAttributes({
        columns: columns.map((c) => (c.key === pendingKey ? colDef : c)),
      });
    },
    [columns, updateAttributes]
  );

  const handleDismissPendingColumn = useCallback(
    (pendingKey: string) => {
      updateAttributes({
        columns: columns.filter((c) => c.key !== pendingKey),
      });
    },
    [columns, updateAttributes]
  );

  const handleDeleteColumn = useCallback(
    (colKey: string) => {
      if (columns.length <= 1) return;
      updateAttributes({
        columns: columns.filter((c) => c.key !== colKey),
      });
    },
    [columns, updateAttributes]
  );

  const handleAddRow = useCallback(() => {
    const pos = getPos();
    if (typeof pos !== 'number') return;
    const insertPos = pos + node.nodeSize - 1;
    editor
      .chain()
      .insertContentAt(insertPos, {
        type: 'medicationRow',
        attrs: { customFields: {} },
      })
      .run();
  }, [editor, getPos, node.nodeSize]);

  const handleAddColumn = useCallback(() => {
    const current = (node.attrs.columns ?? []) as MedicationColumnDef[];
    updateAttributes({ columns: [...current, makePendingColumn()] });
  }, [node, updateAttributes]);

  const stopProseMirror = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };

  return (
    <NodeViewWrapper
      className="medication-table my-2"
      contentEditable={false}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex items-stretch gap-1" onMouseDown={stopProseMirror}>
        {/* Table with horizontal scroll */}
        <div className="relative flex-1 min-w-0">
          {/* Left scroll arrow */}
          {canScrollLeft && (
            <button
              type="button"
              className="absolute left-0 top-0 bottom-0 z-30 flex items-center justify-center w-6 bg-[#F3F4F6] border-r border-[#E5E7EB] rounded-l-lg cursor-pointer hover:bg-[#E5E7EB]"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleScrollLeft();
              }}
            >
              <ChevronLeft className="w-4 h-4 text-[#374151]" />
            </button>
          )}

          {/* Right scroll arrow */}
          {canScrollRight && (
            <button
              type="button"
              className="absolute right-0 top-0 bottom-0 z-30 flex items-center justify-center w-6 bg-[#F3F4F6] border-l border-[#E5E7EB] rounded-r-lg cursor-pointer hover:bg-[#E5E7EB]"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleScrollRight();
              }}
            >
              <ChevronRight className="w-4 h-4 text-[#374151]" />
            </button>
          )}

          <div
            ref={scrollRef}
            className="overflow-x-auto rounded-lg bg-white medication-table-scroll"
          >
            <div
              className="border border-[#E5E7EB] rounded-lg"
              style={{ minWidth: totalMinWidth }}
            >
              {/* Header */}
              <div
                className="grid items-stretch bg-[#F9FAFB] border-b border-[#E5E7EB] rounded-t-lg"
                style={{ gridTemplateColumns: gridTemplate }}
              >
                {columns.map((col) => {
                  const isPending = col.key.startsWith(PENDING_KEY_PREFIX);
                  return (
                    <div
                      key={col.key}
                      className="relative px-3 py-2.5 text-xs font-semibold uppercase tracking-wide border-r border-[#E5E7EB] last:border-r-0"
                      onMouseEnter={() => setHoveredColKey(col.key)}
                      onMouseLeave={() => setHoveredColKey(null)}
                    >
                      <div className={isPending ? 'text-[#9CA3AF] italic normal-case' : 'text-[#6B7280]'}>
                        {isPending ? 'New column' : col.label}
                      </div>

                      {isPending && editable && (
                        <InlineColumnPicker
                          availableColumns={availablePredefined}
                          onPick={(picked) => handleConfigurePendingColumn(col.key, picked)}
                          onDismiss={() => handleDismissPendingColumn(col.key)}
                        />
                      )}

                      {!isPending &&
                        editable &&
                        hoveredColKey === col.key &&
                        columns.length > 1 && (
                          <button
                            type="button"
                            className="absolute top-0.5 right-0.5 z-20 flex items-center justify-center w-4 h-4 rounded-full bg-white border border-[#E5E7EB] text-[#9CA3AF] hover:bg-[#FEF2F2] hover:border-[#FECACA] hover:text-[#DC2626] transition-colors cursor-pointer shadow-sm"
                            title="Delete column"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteColumn(col.key);
                            }}
                          >
                            <Minus className="w-2.5 h-2.5" />
                          </button>
                        )}
                    </div>
                  );
                })}
                <div />
              </div>

              {/* Rows */}
              <NodeViewContent className="medication-table-body block" />
            </div>
          </div>
        </div>

        {/* Add column — always reserve space so table doesn't shift */}
        <button
          type="button"
          className={
            'flex items-center justify-center w-[18px] self-stretch rounded transition-colors ' +
            (editable && hovered
              ? 'border border-[#E5E7EB] bg-white text-[#9CA3AF] hover:bg-[#F9FAFB] hover:text-[#6B7280] cursor-pointer'
              : 'border border-transparent bg-transparent text-transparent pointer-events-none')
          }
          title="Add column"
          disabled={!editable || !hovered}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleAddColumn();
          }}
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>

      {/* Add row — always reserve space so table doesn't shift */}
      <div className="flex items-stretch gap-1 mt-1">
        <button
          type="button"
          className={
            'flex-1 min-w-0 flex items-center justify-center h-[18px] rounded transition-colors ' +
            (editable && hovered
              ? 'border border-[#E5E7EB] bg-white text-[#9CA3AF] hover:bg-[#F9FAFB] hover:text-[#6B7280] cursor-pointer'
              : 'border border-transparent bg-transparent text-transparent pointer-events-none')
          }
          title="Add row"
          disabled={!editable || !hovered}
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
