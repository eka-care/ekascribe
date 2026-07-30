'use client';

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AnchoredDropdown } from './anchored-dropdown';
import { useAutosizeTextarea } from './use-autosize-textarea';

interface DropdownCellProps {
  value: string;
  options: string[];
  placeholder?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function DropdownCell({
  value,
  options,
  placeholder = '',
  onChange,
  disabled = false,
}: DropdownCellProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const display = draft ?? value;
  useAutosizeTextarea(inputRef, display);

  const filtered = useMemo(() => {
    if (!draft) return options;
    const lower = draft.toLowerCase();
    return options.filter((o) => o.toLowerCase().includes(lower));
  }, [options, draft]);

  const handleSelect = useCallback(
    (option: string) => {
      onChange(option);
      setDraft(null);
      setOpen(false);
    },
    [onChange]
  );

  const commitAndClose = useCallback(() => {
    if (draft !== null) onChange(draft);
    setDraft(null);
    setOpen(false);
  }, [draft, onChange]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideAnchor = containerRef.current?.contains(target) ?? false;
      const insideDropdown = dropdownRef.current?.contains(target) ?? false;
      if (!insideAnchor && !insideDropdown) commitAndClose();
    };
    document.addEventListener('mousedown', handleClickOutside, true);
    return () => document.removeEventListener('mousedown', handleClickOutside, true);
  }, [open, commitAndClose]);

  const openDropdown = () => {
    setOpen(true);
    inputRef.current?.focus();
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div
        className={cn(
          'flex items-start gap-1 w-full min-h-7 px-2 text-sm rounded cursor-text',
          'hover:bg-[#F9FAFB] transition-colors',
          open && 'bg-white ring-1 ring-[#215FFF]'
        )}
        onMouseDown={(e) => {
          e.stopPropagation();
          if (!open) openDropdown();
        }}
      >
        <textarea
          ref={inputRef}
          rows={1}
          className="flex-1 min-w-0 resize-none overflow-hidden whitespace-pre-wrap break-words bg-transparent outline-none text-sm text-[#191919] placeholder:text-[#9CA3AF] py-1"
          value={display}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => {
            setDraft(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Escape') {
              setDraft(null);
              setOpen(false);
            }
            if (e.key === 'Enter') {
              e.preventDefault();
              if (draft !== null) {
                onChange(draft);
                setDraft(null);
              }
              setOpen(false);
            }
            if (e.key === 'Tab') setOpen(false);
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        />
        <span
          className="flex items-center justify-center h-5 mt-1 shrink-0 cursor-pointer"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (open) {
              setOpen(false);
              inputRef.current?.blur();
            } else {
              openDropdown();
            }
          }}
        >
          <ChevronDown
            className={cn('w-3.5 h-3.5 text-[#767676] transition-transform', open && 'rotate-180')}
          />
        </span>
      </div>
      <AnchoredDropdown
        ref={dropdownRef}
        anchorRef={containerRef}
        open={open && filtered.length > 0}
        onDismiss={commitAndClose}
        className="max-h-44 overflow-y-auto bg-white border border-[#E5E7EB] rounded-md shadow-[0_8px_24px_rgba(15,23,42,0.12)] py-1"
      >
        {filtered.map((option) => (
          <button
            key={option}
            type="button"
            className={cn(
              'block w-full px-3 py-1.5 text-sm text-left text-[#191919] hover:bg-[#F3F4F6] transition-colors cursor-pointer whitespace-nowrap',
              value === option && 'bg-[#F0F4FF]'
            )}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleSelect(option);
            }}
          >
            {option}
          </button>
        ))}
      </AnchoredDropdown>
    </div>
  );
}
