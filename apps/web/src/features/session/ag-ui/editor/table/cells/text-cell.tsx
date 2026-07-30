'use client';

import { useRef } from 'react';
import { cn } from '@/lib/utils';
import { useAutosizeTextarea } from './use-autosize-textarea';

interface TextCellProps {
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function TextCell({ value, placeholder = '', onChange, disabled = false }: TextCellProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useAutosizeTextarea(textareaRef, value);

  return (
    <div
      className={cn(
        'flex items-start w-full min-h-7 px-2 text-sm rounded cursor-text',
        'hover:bg-[#F9FAFB] focus-within:bg-white focus-within:ring-1 focus-within:ring-[#215FFF] transition-colors'
      )}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <textarea
        ref={textareaRef}
        rows={1}
        className="flex-1 min-w-0 resize-none overflow-hidden whitespace-pre-wrap break-words bg-transparent outline-none text-sm text-[#191919] placeholder:text-[#9CA3AF] py-1"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') e.preventDefault();
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
