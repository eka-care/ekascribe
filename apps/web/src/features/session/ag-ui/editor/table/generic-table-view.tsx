'use client';

import { useCallback, useEffect, useReducer, useState } from 'react';
import { Plus } from 'lucide-react';
import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from '@tiptap/react';

import type { TableConfig } from './types';

interface GenericTableViewProps extends NodeViewProps {
  config: TableConfig;
}

export function GenericTableView({ node, editor, getPos, config }: GenericTableViewProps) {
  const [, forceRender] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const handler = () => forceRender();
    editor.on('transaction', handler);
    return () => {
      editor.off('transaction', handler);
    };
  }, [editor]);

  const editable = editor.isEditable;
  const [hovered, setHovered] = useState(false);

  const handleAddRow = useCallback(() => {
    const pos = getPos();
    if (typeof pos !== 'number') return;
    const insertPos = pos + node.nodeSize - 1;
    editor.chain().insertContentAt(insertPos, { type: config.rowName }).run();
  }, [editor, getPos, node.nodeSize, config.rowName]);

  return (
    <NodeViewWrapper
      className={`${config.cssClass} my-2`}
      contentEditable={false}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex items-stretch gap-1" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex-1 min-w-0 border border-[#E5E7EB] rounded-lg bg-white">
          {/* Header */}
          <div
            className="grid items-stretch bg-[#F9FAFB] border-b border-[#E5E7EB] rounded-t-lg"
            style={{ gridTemplateColumns: config.gridTemplate }}
          >
            {config.columns.map((col) => (
              <div
                key={col.key}
                className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-[#6B7280] border-r border-[#E5E7EB] last:border-r-0"
              >
                {col.label}
              </div>
            ))}
            <div />
          </div>

          {/* Rows */}
          <NodeViewContent className={`${config.bodyClassName} block`} />
        </div>

        {/* Reserve right space to match medication table width */}
        <div className="w-[18px] self-stretch" />
      </div>

      {/* Add row — always reserve space so table doesn't shift */}
      <div className="flex items-stretch gap-1 mt-1">
        <button
          type="button"
          className={
            'flex-1 min-w-0 flex items-center justify-center h-[18px] rounded transition-colors ' +
            (editable && hovered
              ? 'border border-[#E5E7EB] bg-white text-[#9CA3AF] hover:bg-[#F9FAFB] hover:text-[#6B7280] cursor-pointer'
              : 'border border-transparent bg-transparent text-transparent pointer-events-none')
          }
          title="Add row"
          disabled={!editable || !hovered}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleAddRow();
          }}
        >
          <Plus className="w-3 h-3" />
        </button>
        <div className="w-[18px]" />
      </div>
    </NodeViewWrapper>
  );
}
