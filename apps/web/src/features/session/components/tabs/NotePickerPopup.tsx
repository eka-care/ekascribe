'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileText, Loader2, Plus } from 'lucide-react';
import type { NormalizedDocument } from '../../types';

interface NotePickerPopupProps {
  notes: NormalizedDocument[];
  anchor?: { x: number; y: number };
  onPick: (note: NormalizedDocument) => Promise<void>;
  onCreateNote: () => Promise<void>;
  onClose: () => void;
}

const WIDTH = 240;
const MARGIN = 8;
const CREATE_ACTION = '__create__';

export function NotePickerPopup({ notes, anchor, onPick, onCreateNote, onClose }: NotePickerPopupProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>(() => ({
    top: anchor?.y ?? MARGIN,
    left: anchor?.x != null ? anchor.x - WIDTH / 2 : window.innerWidth - WIDTH - MARGIN,
  }));

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const h = el.offsetHeight;
    const ax = anchor?.x ?? window.innerWidth - WIDTH / 2 - MARGIN;
    const ay = anchor?.y ?? window.innerHeight - MARGIN;

    let left = ax - WIDTH / 2;
    if (left + WIDTH + MARGIN > window.innerWidth) left = window.innerWidth - WIDTH - MARGIN;
    if (left < MARGIN) left = MARGIN;

    let top = ay + MARGIN;
    if (top + h + MARGIN > window.innerHeight) top = ay - h - MARGIN;
    setPos({ top, left });
    setReady(true);
  }, [anchor]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (pendingAction) return;
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (pendingAction) return;
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose, pendingAction]);

  const handlePick = async (note: NormalizedDocument) => {
    if (pendingAction) return;
    setPendingAction(note.document_id);
    await onPick(note);
  };

  const handleCreate = async () => {
    if (pendingAction) return;
    setPendingAction(CREATE_ACTION);
    await onCreateNote();
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label="Choose a note"
      className="fixed z-[1100] flex flex-col rounded-lg border border-[#D1D1D1] bg-white p-1 shadow-lg"
      style={{ top: pos.top, left: pos.left, width: WIDTH, opacity: ready ? 1 : 0 }}
    >
      <p className="px-2 py-1.5 text-xs font-semibold text-[#767676]">Copy to note</p>
      <div className="flex max-h-[280px] flex-col gap-0.5 overflow-y-auto">
        {notes.map((note) => {
          const isPending = pendingAction === note.document_id;
          return (
            <button
              key={note.document_id}
              type="button"
              role="menuitem"
              className="flex items-center gap-2 rounded-md p-2 text-left text-sm text-[#1a1a1a] hover:bg-[#F5F5F5] disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => handlePick(note)}
              disabled={pendingAction !== null}
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#767676]" aria-hidden />
              ) : (
                <FileText className="h-4 w-4 shrink-0 text-[#767676]" aria-hidden />
              )}
              <span className="truncate">{note.document_name || 'Untitled note'}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-1 border-t border-[#E5E7EB] pt-1">
        <button
          type="button"
          role="menuitem"
          className="flex w-full items-center gap-2 rounded-md p-2 text-left text-sm font-medium text-[#215FFF] hover:bg-[#F0F4FF] disabled:cursor-not-allowed disabled:opacity-50"
          onClick={handleCreate}
          disabled={pendingAction !== null}
        >
          {pendingAction === CREATE_ACTION ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
          ) : (
            <Plus className="h-4 w-4 shrink-0" aria-hidden />
          )}
          Create and add to note
        </button>
      </div>
    </div>,
    document.body,
  );
}
