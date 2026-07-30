'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';

interface EditorConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function EditorConfirmDialog({
  open,
  title,
  description,
  confirmText = 'Delete',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
}: EditorConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKey, true);
    return () => document.removeEventListener('keydown', handleKey, true);
  }, [open, onCancel]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        className="w-full max-w-[420px] rounded-lg border border-border bg-white p-6 shadow-lg"
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <h2 className="text-base sm:text-lg font-semibold text-[#1A1A1A]">{title}</h2>
        <p className="mt-2 text-sm text-[#1A1A1A]">{description}</p>
        <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            type="button"
            className="w-full sm:w-auto px-4 py-2 rounded-md border border-[#D1D1D1] bg-white text-sm font-medium text-[#1A1A1A] hover:bg-[#F5F5F5] cursor-pointer transition-colors"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onCancel();
            }}
          >
            {cancelText}
          </button>
          <button
            type="button"
            className="w-full sm:w-auto px-4 py-2 rounded-md bg-destructive text-white text-sm font-medium hover:bg-destructive/90 cursor-pointer transition-colors"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onConfirm();
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
