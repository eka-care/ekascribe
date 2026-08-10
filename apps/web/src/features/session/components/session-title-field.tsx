'use client';

import { useEffect, useRef, useState } from 'react';
import { SquarePen, X } from 'lucide-react';
import { useSessionTitle } from '../hooks/use-session-title';

interface SessionTitleFieldProps {
  sessionId: string;
  disabled?: boolean;
  onDisabledClick?: () => void;
}

const SessionTitleField = ({ sessionId, disabled, onDisabledClick }: SessionTitleFieldProps) => {
  const { title, saveTitle, removeTitle } = useSessionTitle(sessionId);
  const [draft, setDraft] = useState(title);
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync draft when the stored title changes (session load, revert on failure)
  useEffect(() => {
    if (!isEditing) setDraft(title);
  }, [title, isEditing]);

  const commit = () => {
    setIsEditing(false);
    if (draft.trim() !== title) saveTitle(draft);
  };

  // Filled + idle → borderless heading; empty or editing → boxed field.
  const hasTitle = !!title && !isEditing;

  return (
    <div
      className={`group flex items-center gap-2 flex-1 sm:flex-none sm:w-72 min-w-0 py-1.5 px-3 rounded-lg border transition-colors ${
        disabled
          ? 'opacity-60 cursor-not-allowed border-transparent'
          : isEditing
          ? 'bg-white border-[#215FFF]'
          : hasTitle
          ? 'border-transparent hover:bg-[#F5F8FF]'
          : 'bg-white border-[#D1D1D1]'
      }`}
    >
      <SquarePen
        className={`w-4 h-4 shrink-0 text-[#767676] transition-opacity ${
          hasTitle ? 'opacity-0 group-hover:opacity-100' : ''
        }`}
      />
      <input
        ref={inputRef}
        type="text"
        value={draft}
        placeholder="Add title"
        disabled={disabled}
        onFocus={() => setIsEditing(true)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            setDraft(title);
            setIsEditing(false);
            e.currentTarget.blur();
          }
        }}
        onMouseDown={(e) => {
          if (disabled) {
            e.preventDefault();
            onDisabledClick?.();
          }
        }}
        className={`flex-1 min-w-0 bg-transparent border-none outline-none text-[#1A1A1A] placeholder:text-[#767676] ${
          hasTitle ? 'text-lg font-semibold' : 'text-base font-medium'
        } ${disabled ? 'cursor-not-allowed' : 'cursor-text'}`}
      />
      {!disabled && hasTitle && (
        <button
          onMouseDown={(e) => {
            // mousedown (not click) so it wins over the input blur
            e.preventDefault();
            removeTitle();
          }}
          title="Remove title"
          className="shrink-0 p-0.5 rounded-md text-[#767676] opacity-0 group-hover:opacity-100 hover:text-[#D92D20] hover:bg-white cursor-pointer transition-all"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};

export default SessionTitleField;
