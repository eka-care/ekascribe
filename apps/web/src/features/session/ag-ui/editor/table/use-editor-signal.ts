'use client';

import { useEffect, useReducer, useRef } from 'react';
import type { Editor } from '@tiptap/core';

export function useEditorSignal<T>(editor: Editor, read: () => T): T {
  const [, forceRender] = useReducer((count: number) => count + 1, 0);

  const readRef = useRef(read);
  readRef.current = read;

  const value = read();
  const renderedRef = useRef(value);
  renderedRef.current = value;

  useEffect(() => {
    const handler = () => {
      if (Object.is(readRef.current(), renderedRef.current)) return;
      forceRender();
    };
    editor.on('transaction', handler);
    return () => {
      editor.off('transaction', handler);
    };
  }, [editor]);

  return value;
}

export function useEditorEditable(editor: Editor): boolean {
  return useEditorSignal(editor, () => editor.isEditable);
}
