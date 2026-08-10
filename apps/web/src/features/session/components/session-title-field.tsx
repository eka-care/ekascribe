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

  return (
    <div className="flex items-center gap-1 min-w-0 w-full sm:w-fit">
      <div
        className={`flex items-center gap-2 flex-1 sm:flex-none sm:w-72 min-w-0 py-1.5 px-3 rounded-lg bg-white border transition-colors ${
          disabled
            ? 'opacity-60 cursor-not-allowed border-[#D1D1D1]'
            : isEditing
            ? 'border-[#215FFF]'
            : 'border-[#D1D1D1]'
        }`}
      >
        <SquarePen className="w-4 h-4 text-[#767676] shrink-0" />
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
          className={`flex-1 min-w-0 text-base font-medium text-[#1A1A1A] placeholder:text-[#767676] bg-transparent border-none outline-none ${
            disabled ? 'cursor-not-allowed' : 'cursor-text'
          }`}
        />
      </div>
      {!disabled && !!title && !isEditing && (
        <button
          onClick={removeTitle}
          title="Remove title"
          className="shrink-0 p-1 rounded-md text-[#767676] hover:text-[#D92D20] hover:bg-[#F5F5F5] cursor-pointer transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};

export default SessionTitleField;
