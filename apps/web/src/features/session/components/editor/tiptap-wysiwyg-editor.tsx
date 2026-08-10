'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useEditor, EditorContent, ReactRenderer } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Highlight } from '@tiptap/extension-highlight';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import { Color } from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import { FontFamily } from '@tiptap/extension-font-family';
import { TextAlign } from '@tiptap/extension-text-align';
import { Underline } from '@tiptap/extension-underline';
import { Link } from '@tiptap/extension-link';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import { Typography } from '@tiptap/extension-typography';
import TurndownService from 'turndown';
import Showdown from 'showdown';
import tippy, { type Instance as TippyInstance } from 'tippy.js';

import Placeholder from '@tiptap/extension-placeholder';
import { Markdown } from 'tiptap-markdown';
import { SlashCommand, getSlashCommandItems } from './slash-command';
import SlashCommandList, { type SlashCommandListHandle } from './slash-command-list';
import EditorToolbar from './editor-toolbar';
import TableAddButtons from './table-add-buttons';
import { isAllowedHref, sanitizeHtmlForNote } from '../../services/html-sanitize';

const turndown = new TurndownService({ headingStyle: 'atx', hr: '---', bulletListMarker: '-' });

turndown.addRule('tableCell', {
  filter: ['th', 'td'],
  replacement: (content) => ` ${content.replace(/\n+/g, ' ').trim()} |`,
});

turndown.addRule('tableRow', {
  filter: 'tr',
  replacement: (content, node) => {
    const cells = Array.from((node as Element).children);
    const isHeader = cells.some((c) => c.nodeName === 'TH');
    const row = `|${content}\n`;
    if (isHeader) {
      return row + `|${' --- |'.repeat(cells.length)}\n`;
    }
    return row;
  },
});

turndown.addRule('table', {
  filter: 'table',
  replacement: (content) => `\n\n${content}\n\n`,
});

const showdownConverter = new Showdown.Converter({ tables: true });

export function htmlToMarkdown(html: string): string {
  return turndown.turndown(sanitizeHtmlForNote(html));
}

export function buildDefaultEditorExtensions(): import('@tiptap/core').Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
    }),
    Highlight,
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    TextStyle,
    Color,
    FontFamily,
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Underline,
    Link.configure({
      openOnClick: false,
      autolink: true,
      linkOnPaste: true,
      isAllowedUri: (url) => isAllowedHref(url),
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Typography,
  ];
}

export interface TiptapEditorHandle {
  getInstance: () => {
    getMarkdown: () => string;
    setMarkdown: (md: string) => void;
    getJSON: () => import('@tiptap/core').JSONContent;
    setJSON: (json: import('@tiptap/core').JSONContent) => void;
    blur: () => void;
    exec: (command: string, payload?: Record<string, unknown>) => void;
  } | null;
}

interface TiptapEditorProps {
  initialValue?: string;
  initialJSON?: import('@tiptap/core').JSONContent;
  customExtensions?: import('@tiptap/core').Extensions;
  onChange: () => void;
  onBlur?: () => void;
  onFocusChange?: (
    focused: boolean,
    exec?: (command: string, payload?: Record<string, unknown>) => void
  ) => void;
  placeholder?: string;
  showToolbar?: boolean;
  editable?: boolean;
}

const TiptapWysiwygEditor = forwardRef<TiptapEditorHandle, TiptapEditorProps>(
  (
    {
      initialValue,
      initialJSON,
      customExtensions,
      onChange,
      onBlur,
      onFocusChange,
      placeholder: placeholderText,
      showToolbar = true,
      editable = true,
    },
    ref
  ) => {
    const [isFocused, setIsFocused] = useState(false);
    const isFocusedRef = useRef(false);
    const mountingRef = useRef(true);
    const suppressBlurRef = useRef(false);
    const editorContainerRef = useRef<HTMLDivElement>(null);
    const userInteractingRef = useRef(false);
    const editableRef = useRef(editable);
    editableRef.current = editable;

    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    const onBlurRef = useRef(onBlur);
    onBlurRef.current = onBlur;

    const onFocusChangeRef = useRef(onFocusChange);
    onFocusChangeRef.current = onFocusChange;

    const renderSuggestion = useCallback(() => {
      let component: ReactRenderer<SlashCommandListHandle> | null = null;
      let popup: TippyInstance[] | null = null;

      return {
        onStart: (props: any) => {
          component = new ReactRenderer(SlashCommandList, {
            props,
            editor: props.editor,
          });

          if (!props.clientRect) return;

          popup = tippy('body', {
            getReferenceClientRect: props.clientRect,
            appendTo: () => document.body,
            content: component.element,
            showOnCreate: true,
            interactive: true,
            trigger: 'manual',
            placement: 'bottom-start',
            offset: [0, 4],
          });
        },

        onUpdate: (props: any) => {
          component?.updateProps(props);
          if (popup?.[0] && props.clientRect) {
            popup[0].setProps({
              getReferenceClientRect: props.clientRect,
            });
          }
        },

        onKeyDown: (props: any) => {
          if (props.event.key === 'Escape') {
            popup?.[0]?.hide();
            return true;
          }
          return component?.ref?.onKeyDown(props) ?? false;
        },

        onExit: () => {
          popup?.[0]?.destroy();
          component?.destroy();
        },
      };
    }, []);

    const defaultExtensions = buildDefaultEditorExtensions();

    const editorOnlyExtensions = [
      Placeholder.configure({
        placeholder: placeholderText || '',
      }),
      Markdown.configure({
        html: true,
        transformPastedText: true,
        transformCopiedText: true,
      }),
      SlashCommand.configure({
        suggestion: {
          items: ({ query }: { query: string }) =>
            getSlashCommandItems().filter((item) =>
              item.title.toLowerCase().includes(query.toLowerCase())
            ),
          render: renderSuggestion,
        },
      }),
    ];

    const resolvedContent = initialJSON ?? showdownConverter.makeHtml(initialValue || '');

    const editor = useEditor({
      immediatelyRender: false,
      extensions: [...(customExtensions ?? defaultExtensions), ...editorOnlyExtensions],
      content: resolvedContent,
      editorProps: {
        attributes: {
          class: 'outline-none min-h-[300px] max-w-none scribe-editor',
        },
      },
      onUpdate: () => {
        if (!editableRef.current) return;
        // Detect user-driven changes: PM focused, NodeView input focused, or pointer interaction in progress
        const nodeViewHasFocus =
          !isFocusedRef.current &&
          !!editorContainerRef.current?.contains(document.activeElement);
        if (isFocusedRef.current || nodeViewHasFocus || userInteractingRef.current)
          onChangeRef.current();
      },
      onFocus: () => {
        if (mountingRef.current) return;
        if (!editableRef.current) return;
        isFocusedRef.current = true;
        setIsFocused(true);
        onFocusChangeRef.current?.(true, execCommand);
      },
      onBlur: () => {
        if (suppressBlurRef.current) return;
        isFocusedRef.current = false;
        setIsFocused(false);
        onFocusChangeRef.current?.(false);
        onBlurRef.current?.();
      },
    });

    useEffect(() => {
      const timer = setTimeout(() => {
        editor?.commands.blur();
        (document.activeElement as HTMLElement)?.blur();
        mountingRef.current = false;
      }, 50);
      return () => clearTimeout(timer);
    }, [editor]);

    // Tracks pointer interactions so deleted-node clicks still trigger onChange
    useEffect(() => {
      const container = editorContainerRef.current;
      if (!container) return;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const handler = () => {
        userInteractingRef.current = true;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          userInteractingRef.current = false;
        }, 100);
      };
      container.addEventListener('pointerdown', handler, true);
      return () => {
        container.removeEventListener('pointerdown', handler, true);
        if (timer) clearTimeout(timer);
      };
    }, []);

    // Fires onBlur when focus leaves the container (covers NodeView inputs PM doesn't track)
    useEffect(() => {
      const container = editorContainerRef.current;
      if (!container) return;

      let blurTimer: ReturnType<typeof setTimeout> | null = null;

      const handleFocusOut = (e: FocusEvent) => {
        if (suppressBlurRef.current) return;
        if (e.relatedTarget && container.contains(e.relatedTarget as Node)) return;

        blurTimer = setTimeout(() => {
          if (!container.contains(document.activeElement) && !isFocusedRef.current) {
            onBlurRef.current?.();
          }
        }, 0);
      };

      const handleFocusIn = () => {
        if (blurTimer) {
          clearTimeout(blurTimer);
          blurTimer = null;
        }
      };

      container.addEventListener('focusout', handleFocusOut);
      container.addEventListener('focusin', handleFocusIn);
      return () => {
        container.removeEventListener('focusout', handleFocusOut);
        container.removeEventListener('focusin', handleFocusIn);
        if (blurTimer) clearTimeout(blurTimer);
      };
    }, [editor]);

    useEffect(() => {
      if (!editor) return;
      editor.setEditable(editable);
    }, [editor, editable]);

    const execCommand = (command: string, payload?: Record<string, unknown>) => {
      if (!editor) return;
      if (command === '__suppressBlur') {
        suppressBlurRef.current = true;
        return;
      }
      if (command === '__unsuppressBlur') {
        suppressBlurRef.current = false;
        return;
      }
      switch (command) {
        case 'heading':
          editor
            .chain()
            .focus()
            .toggleHeading({ level: (payload?.level as 1 | 2 | 3) || 1 })
            .run();
          break;
        case 'bold':
          editor.chain().focus().toggleBold().run();
          break;
        case 'italic':
          editor.chain().focus().toggleItalic().run();
          break;
        case 'strike':
          editor.chain().focus().toggleStrike().run();
          break;
        case 'bulletList':
          editor.chain().focus().toggleBulletList().run();
          break;
        case 'orderedList':
          editor.chain().focus().toggleOrderedList().run();
          break;
        case 'hr':
          editor.chain().focus().setHorizontalRule().run();
          break;
        case 'underline':
          editor.chain().focus().toggleUnderline().run();
          break;
        case 'align':
          editor
            .chain()
            .focus()
            .setTextAlign((payload?.alignment as string) || 'left')
            .run();
          break;
        case 'taskList':
          editor.chain().focus().toggleTaskList().run();
          break;
        case 'link': {
          const url = payload?.href as string;
          if (url) {
            editor.chain().focus().setLink({ href: url }).run();
          } else {
            editor.chain().focus().unsetLink().run();
          }
          break;
        }
        case 'undo':
          editor.chain().focus().undo().run();
          break;
        case 'redo':
          editor.chain().focus().redo().run();
          break;
        case 'table':
          editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
          break;
        case 'color':
          editor
            .chain()
            .focus()
            .setColor((payload?.color as string) || '')
            .run();
          break;
        case 'fontFamily':
          editor
            .chain()
            .focus()
            .setFontFamily((payload?.fontFamily as string) || '')
            .run();
          break;
      }
    };

    useImperativeHandle(ref, () => ({
      getInstance: () => {
        if (!editor) return null;
        return {
          getMarkdown: () =>
            (
              editor.storage as { markdown?: { getMarkdown(): string } }
            )?.markdown?.getMarkdown?.() ?? turndown.turndown(editor.getHTML()),
          setMarkdown: (md: string) => {
            editor.commands.setContent(showdownConverter.makeHtml(md || ''));
          },
          getJSON: () => editor.getJSON(),
          setJSON: (json: import('@tiptap/core').JSONContent) => {
            editor.commands.setContent(json);
          },
          blur: () => editor.commands.blur(),
          exec: execCommand,
        };
      },
    }));

    return (
      <div
        className={`flex flex-col flex-1 min-h-0 h-full w-full wysiwyg-wrapper${
          isFocused ? ' wysiwyg-focused' : ''
        }`}
      >
        {showToolbar && (
          <div
            className="sticky top-0 z-10 -mx-4 px-4 py-1.5 bg-white border-b border-[#eef1f6]"
            onMouseDown={() => { suppressBlurRef.current = true; }}
            onMouseUp={() => { suppressBlurRef.current = false; }}
          >
            <EditorToolbar onExecCommand={execCommand} />
          </div>
        )}
        <div className="pt-3 relative" ref={editorContainerRef}>
          <EditorContent editor={editor} />
          {isFocused && editable && (
            <TableAddButtons editor={editor} containerRef={editorContainerRef} />
          )}
        </div>
      </div>
    );
  }
);

TiptapWysiwygEditor.displayName = 'TiptapWysiwygEditor';

export default TiptapWysiwygEditor;
