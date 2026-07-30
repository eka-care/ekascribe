'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { ChevronDown, Loader2, Trash2 } from 'lucide-react';
import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { cn } from '@/lib/utils';

import type { SectionStatusState } from '../types';
import { closeHistory } from '@tiptap/pm/history';

import { addColumnPatch } from './lab-result/column-actions';
import { AnchoredDropdown } from './table/cells/anchored-dropdown';
import { EditorConfirmDialog } from './editor-confirm-dialog';

type PendingConflict = { value: string; unit: string; date?: string };
type ConflictRow = { pos: number; attrs: Record<string, unknown>; pendingConflict: PendingConflict };
type TableNode = { pos: number; attrs: Record<string, unknown> };

// Any row node across table kinds may carry a `pendingConflict` attr (only
// lab-result rows populate it today) — walking generically keeps this
// section-agnostic instead of importing a specific table's config here.
function findConflictRows(sectionNode: NodeViewProps['node']): ConflictRow[] {
  const rows: ConflictRow[] = [];
  sectionNode.descendants((child, pos) => {
    const pendingConflict = child.attrs.pendingConflict as PendingConflict | null | undefined;
    if (pendingConflict) {
      rows.push({ pos, attrs: child.attrs as Record<string, unknown>, pendingConflict });
    }
  });
  return rows;
}

function findLabResultTable(sectionNode: NodeViewProps['node']): TableNode | null {
  let match: TableNode | null = null;
  sectionNode.descendants((child, pos) => {
    if (!match && child.type.name === 'labResultTable') {
      match = { pos, attrs: child.attrs as Record<string, unknown> };
    }
  });
  return match;
}

/**
 * NodeView for a SectionBlock. Renders a status-aware header (display
 * name as an editable input, delete action, conflict-resolution menu when
 * the section's content has pending conflicts, plus a small chip for
 * in-flight states) and a contentDOM for the section body.
 */
export function SectionBlockView({ node, updateAttributes, editor, getPos }: NodeViewProps) {
  const [, forceRender] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const handler = () => forceRender();
    editor.on('transaction', handler);
    return () => {
      editor.off('transaction', handler);
    };
  }, [editor]);

  const editable = editor.isEditable;
  const displayName = (node.attrs.displayName as string) ?? '';
  const statusState = (node.attrs.statusState as SectionStatusState) ?? 'pending';
  const statusError = (node.attrs.statusError as string | null) ?? null;
  const isLabResults = node.attrs.kind === 'LAB_RESULTS';
  const conflictCount = findConflictRows(node).length;

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const handleDeleteSection = useCallback(() => {
    const pos = getPos();
    if (typeof pos !== 'number') return;
    editor.chain().deleteRange({ from: pos, to: pos + node.nodeSize }).run();
  }, [editor, getPos, node.nodeSize]);

  const handleAddColumn = useCallback(() => {
    const pos = getPos();
    if (typeof pos !== 'number') return;
    const table = findLabResultTable(node);
    if (!table) return;
    const tr = editor.state.tr;
    tr.setNodeMarkup(pos + 1 + table.pos, undefined, { ...table.attrs, ...addColumnPatch(table.attrs) });
    closeHistory(tr);
    editor.view.dispatch(tr);
  }, [editor, getPos, node]);

  const handleKeepAllCurrent = useCallback(() => {
    const pos = getPos();
    if (typeof pos !== 'number') return;
    const contentStart = pos + 1;
    const tr = editor.state.tr;
    let changed = false;
    findConflictRows(node).forEach(({ pos: relPos, attrs }) => {
      changed = true;
      tr.setNodeMarkup(contentStart + relPos, undefined, { ...attrs, pendingConflict: null });
    });
    if (changed) editor.view.dispatch(tr);
  }, [editor, getPos, node]);

  const handleReplaceAllNew = useCallback(() => {
    const pos = getPos();
    if (typeof pos !== 'number') return;
    const contentStart = pos + 1;
    const tr = editor.state.tr;
    let changed = false;
    findConflictRows(node).forEach(({ pos: relPos, attrs, pendingConflict }) => {
      changed = true;
      const currentValue = (attrs.value as string) ?? '';
      const currentUnit = (attrs.unit as string) ?? '';
      const trend = (attrs.trend ?? []) as PendingConflict[];
      const newTrend = [
        { value: currentValue, unit: currentUnit, date: (attrs.date as string) ?? '' },
        ...trend,
      ];
      tr.setNodeMarkup(contentStart + relPos, undefined, {
        ...attrs,
        value: pendingConflict.value,
        unit: pendingConflict.unit,
        date: pendingConflict.date ?? '',
        trend: newTrend,
        pendingConflict: null,
      });
    });
    if (changed) editor.view.dispatch(tr);
  }, [editor, getPos, node]);

  return (
    <NodeViewWrapper className="scribe-section bg-white pt-4 pb-3 first:pt-1" data-kind={node.attrs.kind as string}>
      <header
        className={`flex items-center justify-between gap-2 pb-1.5 mb-1.5
        `}
      >
        <div className="grid items-center shrink-0 h-6">
          <span
            aria-hidden="true"
            className="[grid-area:1/1] invisible whitespace-pre pr-1 text-sm font-bold leading-6 tracking-tight"
          >
            {displayName || 'Section name'}
          </span>
          <input
            type="text"
            className="[grid-area:1/1] w-full min-w-[60px] h-6 leading-6 bg-transparent outline-none text-sm font-bold text-[#111827] disabled:cursor-default tracking-tight"
            value={displayName}
            disabled={!editable}
            onChange={(e) => updateAttributes({ displayName: e.target.value })}
            placeholder="Section name"
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {editable && conflictCount > 0 && (
            <ResolveConflictMenu
              count={conflictCount}
              onKeepAll={handleKeepAllCurrent}
              onReplaceAll={handleReplaceAllNew}
            />
          )}
          {editable && isLabResults && (
            <button
              type="button"
              className="shrink-0 flex items-center px-3 py-1 rounded-md border border-[#D1D1D1] bg-white text-primary text-xs font-medium cursor-pointer transition-colors hover:bg-[#F5F5F5] whitespace-nowrap"
              title="Add column"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                handleAddColumn();
              }}
            >
              Add column
            </button>
          )}
          {editable && isLabResults && (
            <button
              type="button"
              className="shrink-0 flex items-center justify-center h-6 w-6 rounded hover:bg-[#FEF2F2] text-[#767676] hover:text-[#DC2626] cursor-pointer transition-colors"
              title="Delete section"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setDeleteConfirmOpen(true);
              }}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <SectionStatusChip state={statusState} error={statusError} />
        </div>
      </header>
      <NodeViewContent className="[&_*:first-child]:mt-0!" />
      <EditorConfirmDialog
        open={deleteConfirmOpen}
        title="Delete table?"
        description="This table will be permanently deleted from this note."
        confirmText="Delete"
        onConfirm={() => {
          handleDeleteSection();
          setDeleteConfirmOpen(false);
        }}
        onCancel={() => setDeleteConfirmOpen(false)}
      />
    </NodeViewWrapper>
  );
}

function ResolveConflictMenu({
  count,
  onKeepAll,
  onReplaceAll,
}: {
  count: number;
  onKeepAll: () => void;
  onReplaceAll: () => void;
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (anchorRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside, true);
    return () => document.removeEventListener('mousedown', handleClickOutside, true);
  }, [open]);

  const select = (action: () => void) => {
    action();
    setOpen(false);
  };

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className="shrink-0 flex items-center gap-1 px-3 py-1 rounded-md border border-[#D1D1D1] bg-white text-[#DC2626] text-xs font-medium cursor-pointer transition-colors hover:bg-[#F5F5F5] whitespace-nowrap"
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
      >
        Resolve {count} conflict{count === 1 ? '' : 's'}
        <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', open && 'rotate-180')} />
      </button>
      <AnchoredDropdown
        ref={menuRef}
        anchorRef={anchorRef}
        open={open}
        onDismiss={() => setOpen(false)}
        align="right"
        className="min-w-[220px] bg-white border border-[#E5E7EB] rounded-md shadow-[0_8px_24px_rgba(15,23,42,0.12)] py-1"
      >
        <button
          type="button"
          className="block w-full px-3 py-1.5 text-left text-sm text-[#191919] hover:bg-[#F3F4F6] transition-colors cursor-pointer"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            select(onKeepAll);
          }}
        >
          Keep current values for all
        </button>
        <button
          type="button"
          className="block w-full px-3 py-1.5 text-left text-sm text-[#191919] hover:bg-[#F3F4F6] transition-colors cursor-pointer"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            select(onReplaceAll);
          }}
        >
          Replace with new values for all
        </button>
      </AnchoredDropdown>
    </>
  );
}

function SectionStatusChip({ state, error }: { state: SectionStatusState; error: string | null }) {
  if (state === 'extracting' || state === 'pending') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wide text-[#215FFF]">
        <Loader2 className="w-3 h-3 animate-spin" />
        {state === 'extracting' ? 'extracting' : 'waiting'}
      </span>
    );
  }
  if (state === 'error') {
    return (
      <span
        title={error ?? undefined}
        className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wide text-[#991B1B]"
      >
        error
      </span>
    );
  }
  if (state === 'awaiting_input') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wide text-[#92400E]">
        needs input
      </span>
    );
  }
  if (state === 'saved') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wide text-[#065F46]">
        saved
      </span>
    );
  }
  return null;
}
