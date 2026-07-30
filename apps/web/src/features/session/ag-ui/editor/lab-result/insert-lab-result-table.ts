import type { Editor } from '@tiptap/react';
import { v4 as uuidv4 } from 'uuid';

import { buildEmptyLabResultSection, buildEmptyLabResultTable } from './lab-result-mapper';

function topLevelInsertRange(editor: Editor): { from: number; to: number } {
  const { $from } = editor.state.selection;
  if ($from.depth === 0) return { from: $from.pos, to: $from.pos };

  const after = $from.after(1);
  const topNode = $from.node(1);
  if (topNode.type.name === 'paragraph' && topNode.content.size === 0) {
    return { from: $from.before(1), to: after };
  }
  return { from: after, to: after };
}

export function insertLabResultTable(editor: Editor): void {
  if (!editor.schema.nodes.labResultTable) return;

  const sectionKey = uuidv4();
  if (!editor.schema.nodes.sectionBlock) {
    editor.chain().focus().insertContent(buildEmptyLabResultTable(sectionKey)).run();
    return;
  }

  const section = buildEmptyLabResultSection(sectionKey, editor.state.doc.childCount);
  editor.chain().focus().insertContentAt(topLevelInsertRange(editor), section).run();
}
