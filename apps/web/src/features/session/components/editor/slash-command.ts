import { Extension, type Editor } from '@tiptap/react';
import { PluginKey } from '@tiptap/pm/state';
import Suggestion, { SuggestionOptions } from '@tiptap/suggestion';

import { insertLabResultTable } from '../../ag-ui/editor/lab-result/insert-lab-result-table';

export const SlashCommandPluginKey = new PluginKey('slashCommand');

type SlashCommandRange = { from: number; to: number };

export type SlashCommandItem = {
  title: string;
  description: string;
  icon: string;
  command: (props: { editor: Editor; range: SlashCommandRange }) => void;
};

export const SlashCommand = Extension.create({
  name: 'slashCommand',

  addOptions() {
    return {
      suggestion: {
        char: '/',
        startOfLine: false,
        pluginKey: SlashCommandPluginKey,
        command: ({
          editor,
          range,
          props,
        }: {
          editor: Editor;
          range: SlashCommandRange;
          props: SlashCommandItem;
        }) => {
          props.command({ editor, range });
        },
      } as Partial<SuggestionOptions<SlashCommandItem>>,
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion<SlashCommandItem>({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ];
  },
});

const BASE_SLASH_COMMAND_ITEMS: SlashCommandItem[] = [
  {
    title: 'Heading 1',
    description: 'Large section heading',
    icon: 'H1',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run();
    },
  },
  {
    title: 'Heading 2',
    description: 'Medium section heading',
    icon: 'H2',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run();
    },
  },
  {
    title: 'Heading 3',
    description: 'Small section heading',
    icon: 'H3',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run();
    },
  },
  {
    title: 'Bullet List',
    description: 'Create a bullet list',
    icon: 'List',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run();
    },
  },
  {
    title: 'Ordered List',
    description: 'Create a numbered list',
    icon: 'ListOrdered',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run();
    },
  },
  {
    title: 'Blockquote',
    description: 'Add a blockquote',
    icon: 'Quote',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBlockquote().run();
    },
  },
  {
    title: 'Task List',
    description: 'Create a task list with checkboxes',
    icon: 'ListChecks',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleTaskList().run();
    },
  },
  {
    title: 'Table',
    description: 'Insert a 3x3 table',
    icon: 'Table',
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run();
    },
  },
  {
    title: 'Horizontal Rule',
    description: 'Add a divider',
    icon: 'Minus',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run();
    },
  },
];

const LAB_RESULT_SLASH_ITEM: SlashCommandItem = {
  title: 'Lab Result Table',
  description: 'Insert a lab result table',
  icon: 'FlaskConical',
  command: ({ editor, range }) => {
    editor.chain().focus().deleteRange(range).run();
    insertLabResultTable(editor);
  },
};

export const getSlashCommandItems = (editor?: Editor): SlashCommandItem[] => {
  const supportsLabResult = !!editor?.schema.nodes.labResultTable;
  return supportsLabResult ? [...BASE_SLASH_COMMAND_ITEMS, LAB_RESULT_SLASH_ITEM] : BASE_SLASH_COMMAND_ITEMS;
};
