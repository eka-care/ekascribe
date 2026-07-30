'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { type Editor } from '@tiptap/react';
import { Bold, Italic, Strikethrough, Quote } from 'lucide-react';
import { createPortal } from 'react-dom';

interface EditorBubbleMenuProps {
  editor: Editor;
}

type FormatButton = {
  key: string;
  icon: React.ReactNode;
  title: string;
  command: string;
  mark: string;
};

const FORMAT_BUTTONS: FormatButton[] = [
  {
    key: 'bold',
    icon: <Bold className="w-4 h-4" />,
    title: 'Bold (Cmd+B)',
    command: 'toggleBold',
    mark: 'bold',
  },
  {
    key: 'italic',
    icon: <Italic className="w-4 h-4" />,
    title: 'Italic (Cmd+I)',
    command: 'toggleItalic',
    mark: 'italic',
  },
  {
    key: 'strike',
    icon: <Strikethrough className="w-4 h-4" />,
    title: 'Strikethrough',
    command: 'toggleStrike',
    mark: 'strike',
  },
  {
    key: 'blockquote',
    icon: <Quote className="w-4 h-4" />,
    title: 'Blockquote',
    command: 'toggleBlockquote',
    mark: 'blockquote',
  },
];

export default function EditorBubbleMenu({ editor }: EditorBubbleMenuProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const [activeMarks, setActiveMarks] = useState<Set<string>>(new Set());
  const menuRef = useRef<HTMLDivElement>(null);

  const handleBlur = useCallback(() => setIsVisible(false), []);

  const updateMenu = useCallback(() => {
    if (!editor) return;

    const { from, to, empty } = editor.state.selection;

    if (empty || from === to) {
      setIsVisible(false);
      return;
    }

    // Get the coordinates of the selection
    const { view } = editor;
    const start = view.coordsAtPos(from);
    const end = view.coordsAtPos(to);

    const left = (start.left + end.left) / 2;
    const top = start.top - 8;

    setCoords({ top, left });
    setIsVisible(true);

    // Update active marks
    const marks = new Set<string>();
    FORMAT_BUTTONS.forEach((btn) => {
      if (editor.isActive(btn.mark)) marks.add(btn.mark);
    });
    setActiveMarks(marks);
  }, [editor]);

  useEffect(() => {
    if (!editor) return;

    editor.on('selectionUpdate', updateMenu);
    editor.on('blur', handleBlur);
    editor.on('focus', updateMenu);

    return () => {
      editor.off('selectionUpdate', updateMenu);
      editor.off('blur', handleBlur);
      editor.off('focus', updateMenu);
    };
  }, [editor, updateMenu, handleBlur]);

  const handleAction = useCallback(
    (command: string) => {
      if (!editor) return;
      (editor.chain().focus() as any)[command]().run();
      // Re-check active marks after command
      const marks = new Set<string>();
      FORMAT_BUTTONS.forEach((btn) => {
        if (editor.isActive(btn.mark)) marks.add(btn.mark);
      });
      setActiveMarks(marks);
    },
    [editor]
  );

  if (!isVisible) return null;

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-50 flex items-center gap-0.5 bg-popover border border-border rounded-lg shadow-md p-1"
      style={{
        top: `${coords.top}px`,
        left: `${coords.left}px`,
        transform: 'translate(-50%, -100%)',
      }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {FORMAT_BUTTONS.map((btn) => (
        <button
          key={btn.key}
          title={btn.title}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleAction(btn.command);
          }}
          className={`p-1.5 rounded-md transition-colors cursor-pointer ${
            activeMarks.has(btn.mark)
              ? 'bg-accent text-accent-foreground'
              : 'text-foreground hover:bg-accent/50'
          }`}
        >
          {btn.icon}
        </button>
      ))}
    </div>,
    document.body
  );
}
