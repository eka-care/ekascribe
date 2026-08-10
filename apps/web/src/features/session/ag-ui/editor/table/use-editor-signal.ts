'use client';

import { useEffect, useReducer, useRef } from 'react';
import type { Editor } from '@tiptap/core';

type EditorEvent = 'transaction' | 'update';

const ON_TRANSACTION: EditorEvent[] = ['transaction'];
const ON_TRANSACTION_OR_UPDATE: EditorEvent[] = ['transaction', 'update'];

export function useEditorSignal<T>(
  editor: Editor,
  read: () => T,
  events: EditorEvent[] = ON_TRANSACTION
): T {
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
    events.forEach((event) => editor.on(event, handler));
    return () => {
      events.forEach((event) => editor.off(event, handler));
    };
  }, [editor, events]);

  return value;
}

export function useEditorEditable(editor: Editor): boolean {
  return useEditorSignal(editor, () => editor.isEditable, ON_TRANSACTION_OR_UPDATE);
}
