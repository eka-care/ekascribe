'use client';

import { memo } from 'react';
import { Loader2 } from 'lucide-react';

import type { SectionStatusState } from '../../types';

interface SectionStatusChipProps {
  state: SectionStatusState;
  error: string | null;
}

export const SectionStatusChip = memo(function SectionStatusChip({
  state,
  error,
}: SectionStatusChipProps) {
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
});
