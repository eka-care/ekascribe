'use client';

import { useCallback, useEffect, useReducer } from 'react';
import { X } from 'lucide-react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';

export function VitalRowView({ node, updateAttributes, editor, getPos }: NodeViewProps) {
  // Re-render when editor editable state changes (e.g. streaming → finished).
  const [, forceRender] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const handler = () => forceRender();
    editor.on('transaction', handler);
    return () => {
      editor.off('transaction', handler);
    };
  }, [editor]);

  const editable = editor.isEditable;
  const attrs = node.attrs as Record<string, string>;

  const handleChange = useCallback(
    (field: string, val: string) => updateAttributes({ [field]: val }),
    [updateAttributes]
  );

  const handleDelete = useCallback(() => {
    const pos = getPos();
    if (typeof pos !== 'number') return;
    editor.chain().deleteRange({ from: pos, to: pos + node.nodeSize }).run();
  }, [editor, getPos, node.nodeSize]);

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <NodeViewWrapper
      className="vital-row group"
      contentEditable={false}
      onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
    >
      <div className="relative border border-[#E5E7EB] rounded-lg p-3 bg-white hover:shadow-sm transition-shadow min-w-0">
        {/* Delete */}
        {editable && (
          <button
            type="button"
            className="absolute -top-2 -right-2 z-10 flex items-center justify-center w-4 h-4 rounded-full bg-white border border-[#E5E7EB] text-[#9CA3AF] hover:bg-[#FEF2F2] hover:border-[#FECACA] hover:text-[#DC2626] transition-colors cursor-pointer shadow-sm opacity-0 group-hover:opacity-100"
            title="Remove vital"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete();
            }}
          >
            <X className="w-2.5 h-2.5" />
          </button>
        )}

        {/* Top: vital name + normal range */}
        <div className="flex items-baseline flex-wrap justify-between gap-x-2 mb-2">
          <span className="text-sm font-semibold text-[#191919]">{attrs.vital_name}</span>
          {attrs.normal_range && (
            <span className="text-xs text-[#9CA3AF]">
              Normal: {attrs.normal_range}
            </span>
          )}
        </div>

        {/* Value + unit */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            className="flex-1 min-w-0 px-2 py-1.5 text-sm text-[#191919] bg-[#F9FAFB] border border-[#E5E7EB] rounded outline-none focus:border-[#215FFF] focus:bg-white transition-colors placeholder:text-[#9CA3AF]"
            value={attrs.value ?? ''}
            placeholder="Value"
            disabled={!editable}
            onChange={(e) => handleChange('value', e.target.value)}
            onKeyDown={stop}
            onMouseDown={stop}
            onClick={stop}
          />
          {attrs.unit && (
            <span className="text-sm text-[#9CA3AF] whitespace-nowrap">{attrs.unit}</span>
          )}
        </div>

        {/* Notes — always underline style to avoid visual jump on editable toggle */}
        {(editable || attrs.notes) && (
          <div className="mt-2">
            <input
              type="text"
              className="w-full px-2 py-1 text-xs text-[#6B7280] bg-transparent border-b border-[#E5E7EB] focus:border-[#215FFF] outline-none transition-colors placeholder:text-[#D1D5DB]"
              value={attrs.notes ?? ''}
              placeholder={editable ? 'Add notes...' : ''}
              disabled={!editable}
              onChange={(e) => handleChange('notes', e.target.value)}
              onKeyDown={stop}
              onMouseDown={stop}
              onClick={stop}
            />
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}
