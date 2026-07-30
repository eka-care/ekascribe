'use client';

import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from '@tiptap/react';

/**
 * NodeView for a KEY_VALUE row.
 *
 * Renders the key on the left as an editable <input> (locked while the
 * editor is non-editable) and the value on the right as inline
 * ProseMirror content so the user can apply marks, paste links, etc.
 */
export function KvItemView({ node, updateAttributes, editor }: NodeViewProps) {
  const editable = editor.isEditable;
  const keyName = (node.attrs.keyName as string) ?? '';

  return (
    <NodeViewWrapper className="kv-item grid grid-cols-[minmax(8rem,13rem)_1fr] gap-x-6 py-[5px]">
      <input
        type="text"
        className="bg-transparent outline-none text-xs uppercase tracking-wide text-[#6B7280] font-medium disabled:cursor-default"
        value={keyName}
        disabled={!editable}
        onChange={(e) => updateAttributes({ keyName: e.target.value })}
        placeholder="Label"
      />
      <NodeViewContent as="div" className="text-sm text-[#191919] min-h-5" />
    </NodeViewWrapper>
  );
}
