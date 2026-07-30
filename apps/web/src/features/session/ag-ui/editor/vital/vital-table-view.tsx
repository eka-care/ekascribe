'use client';

import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from '@tiptap/react';

export function VitalTableView(_props: NodeViewProps) {
  return (
    <NodeViewWrapper className="vital-table my-2" contentEditable={false}>
      <style>{`
        .vital-table [data-node-view-content],
        .vital-table [data-node-view-content-react] {
          display: contents !important;
        }
        .vital-table .vital-row {
          height: 100%;
        }
        .vital-table .vital-row > div {
          height: 100%;
        }
      `}</style>
      <div
        className="grid grid-cols-3 gap-3"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <NodeViewContent />
      </div>
    </NodeViewWrapper>
  );
}
