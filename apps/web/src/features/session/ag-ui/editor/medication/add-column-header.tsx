'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

import type { MedicationColumnDef } from './medication-columns';

interface InlineColumnPickerProps {
  availableColumns: MedicationColumnDef[];
  onPick: (colDef: MedicationColumnDef) => void;
  onDismiss: () => void;
}

export function InlineColumnPicker({
  availableColumns,
  onPick,
  onDismiss,
}: InlineColumnPickerProps) {
  const [customLabel, setCustomLabel] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const updatePosition = useCallback(() => {
    const parent = containerRef.current?.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const dropdownWidth = 240;
    const dropdownHeight = 300;
    // Clamp left so dropdown stays within viewport
    let left = rect.right - dropdownWidth;
    if (left < 8) left = 8;
    if (left + dropdownWidth > window.innerWidth - 8) left = window.innerWidth - dropdownWidth - 8;
    // If dropdown would go below viewport, show above the header cell
    let top = rect.bottom + 4;
    if (top + dropdownHeight > window.innerHeight) {
      top = rect.top - dropdownHeight - 4;
    }
    setPos({ top, left });
  }, []);

  useEffect(() => {
    updatePosition();
    inputRef.current?.focus();
  }, [updatePosition]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onDismiss();
      }
    };
    document.addEventListener('mousedown', handleClickOutside, true);
    return () => document.removeEventListener('mousedown', handleClickOutside, true);
  }, [onDismiss]);

  const handleAddCustom = () => {
    const label = customLabel.trim();
    if (!label) return;
    const key = `custom_${label.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;
    onPick({ key, label, kind: 'text' });
  };

  return (
    <div
      ref={containerRef}
      className="fixed z-50 w-60 bg-white border border-[#E5E7EB] rounded-md shadow-[0_8px_24px_rgba(15,23,42,0.12)] overflow-hidden"
      style={pos ? { top: pos.top, left: pos.left } : { visibility: 'hidden' }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="p-2 border-b border-[#F3F4F6]">
        <input
          ref={inputRef}
          type="text"
          className="w-full px-2 py-1.5 text-sm bg-[#F9FAFB] border border-[#E5E7EB] rounded outline-none focus:border-[#215FFF] text-[#191919] placeholder:text-[#9CA3AF]"
          placeholder="Custom column name..."
          value={customLabel}
          onChange={(e) => setCustomLabel(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAddCustom();
            }
            if (e.key === 'Escape') onDismiss();
          }}
        />
      </div>

      {availableColumns.length > 0 && (
        <div className="max-h-56 overflow-y-auto py-1">
          {availableColumns.map((col) => (
            <button
              key={col.key}
              type="button"
              className={cn(
                'flex items-center gap-2 w-full px-3 py-2 text-sm text-left',
                'hover:bg-[#F3F4F6] transition-colors cursor-pointer'
              )}
              onMouseDown={(e) => {
                e.preventDefault();
                onPick(col);
              }}
            >
              <span className="text-[#191919]">{col.label}</span>
              <span className="ml-auto text-[10px] uppercase tracking-wide text-[#9CA3AF]">
                {col.kind}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
