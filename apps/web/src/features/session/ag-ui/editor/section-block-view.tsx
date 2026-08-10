'use client';

import { Loader2 } from 'lucide-react';
import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from '@tiptap/react';

import type { SectionStatusState } from '../types';

/**
 * NodeView for a SectionBlock. Renders a status-aware header (display
 * name as an editable input, plus a small chip for in-flight states)
 * and a contentDOM for the section body.
 */
export function SectionBlockView({ node, updateAttributes, editor }: NodeViewProps) {
  const editable = editor.isEditable;
  const displayName = (node.attrs.displayName as string) ?? '';
  const statusState = (node.attrs.statusState as SectionStatusState) ?? 'pending';
  const statusError = (node.attrs.statusError as string | null) ?? null;

  return (
    <NodeViewWrapper className="scribe-section bg-white pt-4 pb-3 first:pt-1" data-kind={node.attrs.kind as string}>
      <header
        className={`flex items-center justify-between gap-2 pb-1.5 mb-1.5
        `}
      >
        <div className="grid items-center shrink-0 h-6">
          <span
            aria-hidden="true"
            className="[grid-area:1/1] invisible whitespace-pre pr-1 text-sm font-bold leading-6 tracking-tight"
          >
            {displayName || 'Section name'}
          </span>
          <input
            type="text"
            className="[grid-area:1/1] w-full min-w-[60px] h-6 leading-6 bg-transparent outline-none text-sm font-bold text-[#111827] disabled:cursor-default tracking-tight"
            value={displayName}
            disabled={!editable}
            onChange={(e) => updateAttributes({ displayName: e.target.value })}
            placeholder="Section name"
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <SectionStatusChip state={statusState} error={statusError} />
        </div>
      </header>
      <NodeViewContent className="[&_*:first-child]:mt-0!" />
    </NodeViewWrapper>
  );
}

function SectionStatusChip({ state, error }: { state: SectionStatusState; error: string | null }) {
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
}
