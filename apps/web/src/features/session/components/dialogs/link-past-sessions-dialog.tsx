'use client';

import { useState, useEffect, useRef } from 'react';
import { Check, History, Loader2, X } from 'lucide-react';
import { TPastSessionHistoryData } from '@/constants/types';
import { formatDate } from '@/utils/format-date-time';
import InlineAlert from '@/shared-components/inline-alert';

interface LinkPastSessionsDialogProps {
  sessions: TPastSessionHistoryData[];
  onClose: () => void;
  onAddContext: (sessions: TPastSessionHistoryData[]) => void;
  onRemoveContext?: (txnId: string) => void;
  alreadyLinkedIds?: string[];
  maxSelections?: number;
  loading?: boolean;
}

const LinkPastSessionsDialog = ({
  sessions,
  onClose,
  onAddContext,
  onRemoveContext,
  alreadyLinkedIds = [],
  maxSelections = 1,
  loading = false,
}: LinkPastSessionsDialogProps) => {
  // Track which sessions are checked — start with already-linked ones
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(alreadyLinkedIds));
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  const toggleSession = (txnId: string) => {
    const isAlreadyLinked = alreadyLinkedIds.includes(txnId);

    if (selectedIds.has(txnId)) {
      // Deselect — if it was already linked, unlink it server-side too
      if (isAlreadyLinked) {
        onRemoveContext?.(txnId);
      }
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(txnId);
        return next;
      });
      return;
    }

    if (selectedIds.size >= maxSelections) return;

    setSelectedIds((prev) => {
      if (maxSelections === 1) {
        // Single-select: drop the previous pick, unlinking it if it was saved
        prev.forEach((id) => {
          if (alreadyLinkedIds.includes(id)) {
            onRemoveContext?.(id);
          }
        });
        return new Set([txnId]);
      }
      return new Set(prev).add(txnId);
    });
  };

  const handleAddContext = () => {
    // Only send sessions that aren't already linked
    const newlySelected = sessions.filter(
      (s) => selectedIds.has(s.txn_id) && !alreadyLinkedIds.includes(s.txn_id)
    );
    if (newlySelected.length > 0) {
      onAddContext(newlySelected);
    } else {
      onClose();
    }
  };

  const isFull = selectedIds.size >= maxSelections;

  // Empty state: compact inline alert instead of the full dialog
  if (!loading && sessions.length === 0) {
    return (
      <InlineAlert
        icon={
          <div className="w-12 h-12 rounded-full bg-[#FDE68A] flex items-center justify-center">
            <History className="w-5 h-5 text-foreground" />
          </div>
        }
        title="No past sessions found"
        description="Past sessions will appear here once you have completed one."
        onClose={onClose}
      />
    );
  }

  return (
    <div
      ref={dialogRef}
      className="w-81 shadow-lg p-4 bg-white border border-[#D1D1D1] rounded-lg flex flex-col gap-4"
    >
      <div className="flex items-center justify-between">
        <p className="text-base font-semibold text-[#1A1A1A] leading-6">Link past sessions</p>
        <button
          onClick={onClose}
          className="cursor-pointer hover:opacity-80 transition-opacity shrink-0"
        >
          <X className="w-5 h-5 text-[#767676]" />
        </button>
      </div>

      <div className="flex flex-col overflow-y-auto gap-3 max-h-40">
        {loading && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-[#767676]" />
          </div>
        )}
        {!loading &&
          sessions.map((session) => {
            const isSelected = selectedIds.has(session.txn_id);
            const isDisabled = !isSelected && isFull;
            const { date, time } = formatDate(session.created_at);
            const title = session.session_details?.title?.trim();
            return (
              <button
                key={session.txn_id}
                onClick={() => !isDisabled && toggleSession(session.txn_id)}
                className={`flex items-center justify-between gap-2 text-left w-full ${
                  isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
                }`}
              >
                {title ? (
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm text-[#1A1A1A]">{title}</span>
                    <span className="text-xs text-[#767676]">
                      {date} · {time}
                    </span>
                  </span>
                ) : (
                  <span className="text-sm text-[#1A1A1A]">
                    {date} · {time}
                  </span>
                )}
                <div
                  className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                    isSelected ? 'bg-[#215FFF] border-[#215FFF]' : 'border-[#D1D1D1] bg-white'
                  }`}
                >
                  {isSelected && <Check className="w-3 h-3 text-white" />}
                </div>
              </button>
            );
          })}
      </div>

      <div className="flex flex-col items-center gap-2">
        <button
          onClick={handleAddContext}
          disabled={selectedIds.size === 0}
          className="w-full py-1.5 px-2 rounded-lg bg-[#215FFF] text-sm font-medium text-white cursor-pointer hover:bg-[#215FFF]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Add context from selected sessions
        </button>
        <span className="text-xs text-[#767676]">
          You can link upto {maxSelections} {maxSelections === 1 ? 'session' : 'sessions'}
        </span>
      </div>
    </div>
  );
};

export default LinkPastSessionsDialog;
