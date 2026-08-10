'use client';

import { useEffect, useState, type RefObject } from 'react';
import { useEditorState, type Editor } from '@tiptap/react';

import { HEADING_LEVELS } from './editor-toolbar';

const SECTION_TITLE_LEVEL = 3;

type FocusOverride = 1 | 2 | 3 | null | undefined;

function resolveFocusOverride(target: EventTarget | null): FocusOverride {
  if (!(target instanceof HTMLElement)) return undefined;
  if (target.closest('[data-section-title]')) return SECTION_TITLE_LEVEL;
  if (target.closest('input, textarea, select, button, [role="button"]')) return null;
  return undefined;
}

export function useActiveHeadingLevel(
  editor: Editor | null,
  containerRef: RefObject<HTMLElement | null>
): 1 | 2 | 3 | null {
  const pmHeadingLevel = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => {
      if (!currentEditor) return null;
      return HEADING_LEVELS.find((level) => currentEditor.isActive('heading', { level })) ?? null;
    },
  });

  const [focusOverride, setFocusOverride] = useState<FocusOverride>(undefined);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleFocusIn = (e: FocusEvent) => setFocusOverride(resolveFocusOverride(e.target));
    const handleFocusOut = (e: FocusEvent) => setFocusOverride(resolveFocusOverride(e.relatedTarget));

    container.addEventListener('focusin', handleFocusIn);
    container.addEventListener('focusout', handleFocusOut);
    return () => {
      container.removeEventListener('focusin', handleFocusIn);
      container.removeEventListener('focusout', handleFocusOut);
    };
  }, [containerRef]);

  return focusOverride !== undefined ? focusOverride : pmHeadingLevel;
}
