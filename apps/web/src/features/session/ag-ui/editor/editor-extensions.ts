/**
 * Single source of truth for the extensions used by the streamed
 * scribe editor. Imported by both the editor component and the
 * ScribeState ⇄ TipTap converters so generateJSON / generateHTML
 * parse against the same schema the editor renders.
 *
 * Schema extensions live here (shared between editor + converters).
 * Editor-only extensions (SlashCommand, Placeholder, Markdown) are
 * added in editable-streamed-doc.tsx on top of these.
 */

import StarterKit from '@tiptap/starter-kit';
import { Highlight } from '@tiptap/extension-highlight';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { Underline } from '@tiptap/extension-underline';
import { Link } from '@tiptap/extension-link';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { FontFamily } from '@tiptap/extension-font-family';
import { TextAlign } from '@tiptap/extension-text-align';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import { Typography } from '@tiptap/extension-typography';
import type { Extensions } from '@tiptap/core';

import { SectionBlock } from './section-block';
import { TypedTableCell } from './typed-table-cell';
import { TypedTableHeader } from './typed-table-header';
import { KVItem, KVList } from './kv-list';
import { MedicationTable } from './medication/medication-table';
import { MedicationRow } from './medication/medication-row';
import { VitalTable } from './vital/vital-table';
import { VitalRow } from './vital/vital-row';
import { LabResultTable } from './lab-result/lab-result-table';
import { LabResultRow } from './lab-result/lab-result-row';
import { ProcedureTable } from './procedure/procedure-table';
import { ProcedureRow } from './procedure/procedure-row';

export function buildScribeEditorExtensions(): Extensions {
  return [
    StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
    Highlight,
    Table.configure({ resizable: true }),
    TableRow,
    TypedTableHeader,
    TypedTableCell,
    TextStyle,
    Color,
    FontFamily,
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Underline,
    Link.configure({
      openOnClick: false,
      autolink: true,
      linkOnPaste: true,
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Typography,
    SectionBlock,
    KVList,
    KVItem,
    MedicationTable,
    MedicationRow,
    VitalTable,
    VitalRow,
    LabResultTable,
    LabResultRow,
    ProcedureTable,
    ProcedureRow,
  ];
}
