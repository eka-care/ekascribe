'use client';

import { useCallback, useRef } from 'react';
import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from '@tiptap/react';

import { SectionTitle } from './section-header/section-title';
import { SectionStatusChip } from './section-header/section-status-chip';
import { useEditorEditable } from './table/use-editor-signal';
import type { SectionStatusState } from '../types';

/**
 * NodeView for a SectionBlock. Renders a status-aware header (display
 * name as an editable h2, plus a small chip for in-flight states) and a
 * contentDOM for the section body.
 */
export function SectionBlockView({ node, updateAttributes, editor, getPos }: NodeViewProps) {
  const editable = useEditorEditable(editor);
  const displayName = (node.attrs.displayName as string) ?? '';
  const statusState = (node.attrs.statusState as SectionStatusState) ?? 'pending';
  const statusError = (node.attrs.statusError as string | null) ?? null;

  const latest = useRef({ editor, getPos, node, updateAttributes });
  latest.current = { editor, getPos, node, updateAttributes };

  const handleDisplayNameChange = useCallback((value: string) => {
    latest.current.updateAttributes({ displayName: value });
  }, []);

  const handleTitleEnter = useCallback(({ before, after }: { before: string; after: string }) => {
    const { editor: ed, getPos: pos, node: sectionNode } = latest.current;
    const at = pos();
    if (typeof at !== 'number') return;

    if (!before && after) {
      ed.chain().insertContentAt(at, { type: 'paragraph' }).run();
      return;
    }

    if (after) {
      ed.chain()
        .command(({ tr }) => {
          tr.setNodeMarkup(at, undefined, { ...sectionNode.attrs, displayName: before });
          return true;
        })
        .insertContentAt(at + 1, { type: 'paragraph', content: [{ type: 'text', text: after }] })
        .focus(at + 2)
        .run();
      return;
    }

    ed.chain()
      .insertContentAt(at + 1, { type: 'paragraph' })
      .focus(at + 2)
      .run();
  }, []);

  // Backspace at title start: remove an empty line directly above the
  // section (inverse of Enter-at-start); the caret stays in the title.
  const handleTitleBackspace = useCallback(() => {
    const { editor: ed, getPos: pos } = latest.current;
    const at = pos();
    if (typeof at !== 'number') return;
    const nodeBefore = ed.state.doc.resolve(at).nodeBefore;
    if (!nodeBefore || !nodeBefore.isTextblock || nodeBefore.content.size > 0) return;
    ed.chain().deleteRange({ from: at - nodeBefore.nodeSize, to: at }).run();
  }, []);

  // Forward delete at title end: swallow an empty first body line
  // (inverse of Enter-at-end), never the section's last remaining block.
  const handleTitleForwardDelete = useCallback(() => {
    const { editor: ed, getPos: pos, node: sectionNode } = latest.current;
    const at = pos();
    if (typeof at !== 'number') return;
    const first = sectionNode.firstChild;
    if (!first || !first.isTextblock || first.content.size > 0) return;
    if (sectionNode.childCount < 2) return;
    ed.chain().deleteRange({ from: at + 1, to: at + 1 + first.nodeSize }).run();
  }, []);

  return (
    <NodeViewWrapper
      className="scribe-section bg-white pt-4 pb-3 first:pt-1"
      data-kind={node.attrs.kind as string}
    >
      <header
        contentEditable={false}
        className="flex items-center justify-between gap-2 pb-1.5 mb-1.5"
      >
        <SectionTitle
          displayName={displayName}
          editable={editable}
          onChange={handleDisplayNameChange}
          onEnter={handleTitleEnter}
          onBackspaceAtStart={handleTitleBackspace}
          onDeleteAtEnd={handleTitleForwardDelete}
        />
        <div className="flex items-center gap-2 shrink-0">
          <SectionStatusChip state={statusState} error={statusError} />
        </div>
      </header>
      <NodeViewContent className="[&_*:first-child]:mt-0!" />
    </NodeViewWrapper>
  );
}
