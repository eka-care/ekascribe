'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TiptapEditorHandle } from '../components/editor/tiptap-wysiwyg-editor';

export function useEditorFocus(editorRef: React.RefObject<TiptapEditorHandle | null>) {
  const [editorFocused, setEditorFocused] = useState(false);
  const [chatDockOpen, setChatDockOpen] = useState(false);
  const execCommandRef = useRef<
    ((cmd: string, payload?: Record<string, unknown>) => void) | undefined
  >(undefined);
  const editorWrapperRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  const handleFocusChange = useCallback(
    (focused: boolean, exec?: (cmd: string, payload?: Record<string, unknown>) => void) => {
      setEditorFocused(focused);
      execCommandRef.current = exec;
    },
    []
  );

  const handleOpenChatDock = useCallback(() => setChatDockOpen(true), []);
  const handleCloseChatDock = useCallback(() => setChatDockOpen(false), []);

  // Blur editor when clicking outside editor + toolbar
  useEffect(() => {
    if (!editorFocused) return;
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (editorWrapperRef.current?.contains(target)) return;
      execCommandRef.current?.('__unsuppressBlur');
      editorRef.current?.getInstance()?.blur();
      setEditorFocused(false);
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [editorFocused, editorRef]);

  const handleToolbarMouseDown = useCallback(() => {
    execCommandRef.current?.('__suppressBlur');
    document.addEventListener(
      'mouseup',
      () => {
        execCommandRef.current?.('__unsuppressBlur');
      },
      { once: true }
    );
  }, []);

  const handleExecCommand = useCallback(
    (cmd: string, payload?: Record<string, unknown>) => {
      execCommandRef.current?.(cmd, payload);
    },
    []
  );

  return {
    editorFocused,
    chatDockOpen,
    editorWrapperRef,
    toolbarRef,
    handleFocusChange,
    handleOpenChatDock,
    handleCloseChatDock,
    handleToolbarMouseDown,
    handleExecCommand,
  };
}
