'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

import useVoice2RxStore from '@/store/store';
import type { SearchFn, SearchResult } from '../types';
import { AnchoredDropdown } from './anchored-dropdown';
import { useAutosizeTextarea } from './use-autosize-textarea';

interface AutocompleteCellProps {
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
  onSelect?: (item: SearchResult) => void;
  disabled?: boolean;
  searchFn: SearchFn;
}

const DEBOUNCE_MS = 250;

export function AutocompleteCell({
  value,
  placeholder = 'Search...',
  onChange,
  onSelect,
  disabled = false,
  searchFn,
}: AutocompleteCellProps) {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const docid = useVoice2RxStore((s) => s.loggedInUserDetails?.oid);
  useAutosizeTextarea(inputRef, value);

  useEffect(() => {
    if (!open) return;
    const query = value.trim();
    if (!query) {
      setResults([]);
      setLoading(false);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      searchFn(query, docid, controller.signal)
        .then((res) => {
          if (controller.signal.aborted) return;
          setResults(res);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, open, docid, searchFn]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleSelect = useCallback(
    (item: SearchResult) => {
      onChange(item.name);
      onSelect?.(item);
      setOpen(false);
    },
    [onChange, onSelect]
  );

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideAnchor = containerRef.current?.contains(target) ?? false;
      const insideDropdown = dropdownRef.current?.contains(target) ?? false;
      if (!insideAnchor && !insideDropdown) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside, true);
    return () => document.removeEventListener('mousedown', handleClickOutside, true);
  }, [open]);

  return (
    <div ref={containerRef} className="relative w-full">
      <div
        className={cn(
          'flex items-start gap-1.5 w-full min-h-7 px-2 text-sm rounded cursor-text',
          'hover:bg-[#F9FAFB] transition-colors',
          open && 'bg-white ring-1 ring-[#215FFF]'
        )}
        onMouseDown={(e) => {
          e.stopPropagation();
          if (!open) {
            setOpen(true);
            inputRef.current?.focus();
          }
        }}
      >
        <span className="flex items-center justify-center h-6 pt-1 shrink-0">
          <Search className="w-3 h-3 text-[#767676]" />
        </span>
        <textarea
          ref={inputRef}
          rows={1}
          className="flex-1 min-w-0 resize-none overflow-hidden whitespace-pre-wrap break-words bg-transparent outline-none text-sm text-[#191919] placeholder:text-[#9CA3AF] py-1"
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => {
            onChange(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Escape') {
              setOpen(false);
              inputRef.current?.blur();
            }
            if (e.key === 'Enter') e.preventDefault();
            if (e.key === 'Tab') setOpen(false);
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        />
        {loading && (
          <span className="flex items-center justify-center h-5 mt-1 shrink-0">
            <Loader2 className="w-3 h-3 text-[#9CA3AF] animate-spin" />
          </span>
        )}
      </div>
      <AnchoredDropdown
        ref={dropdownRef}
        anchorRef={containerRef}
        open={open && (results.length > 0 || (loading && value.trim() !== ''))}
        onDismiss={() => setOpen(false)}
        className="max-h-60 max-w-80 overflow-y-auto bg-white border border-[#E5E7EB] rounded-md shadow-[0_8px_24px_rgba(15,23,42,0.12)] py-1"
      >
        {results.length === 0 && loading && (
          <div className="px-3 py-2 text-xs text-[#9CA3AF]">Searching…</div>
        )}
        {results.map((item) => (
          <button
            key={item.id}
            type="button"
            className="block w-full px-3 py-1.5 text-sm text-left hover:bg-[#F3F4F6] transition-colors cursor-pointer"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleSelect(item);
            }}
          >
            <div className="text-[#191919] truncate">{item.name}</div>
            {item.subtitle && (
              <div className="text-[11px] text-[#9CA3AF] truncate">{item.subtitle}</div>
            )}
          </button>
        ))}
      </AnchoredDropdown>
    </div>
  );
}
