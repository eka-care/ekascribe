'use client';

import { memo, useLayoutEffect, useRef } from 'react';

interface SectionTitleProps {
  displayName: string;
  editable: boolean;
  onChange: (value: string) => void;
  onEnter: (split: { before: string; after: string }) => void;
  onBackspaceAtStart: () => void;
  onDeleteAtEnd: () => void;
}

function caretOffsets(el: HTMLElement, text: string): { start: number; end: number } {
  let start = text.length;
  let end = text.length;
  const sel = window.getSelection();
  if (sel?.rangeCount && el.contains(sel.getRangeAt(0).startContainer)) {
    const range = sel.getRangeAt(0);
    const measure = range.cloneRange();
    measure.selectNodeContents(el);
    measure.setEnd(range.startContainer, range.startOffset);
    start = measure.toString().length;
    measure.setEnd(range.endContainer, range.endOffset);
    end = measure.toString().length;
  }
  return { start, end };
}

export const SectionTitle = memo(function SectionTitle({
  displayName,
  editable,
  onChange,
  onEnter,
  onBackspaceAtStart,
  onDeleteAtEnd,
}: SectionTitleProps) {
  const ref = useRef<HTMLHeadingElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if ((el.textContent ?? '') !== displayName && document.activeElement !== el) {
      el.textContent = displayName;
    }
  }, [displayName]);

  return (
    <h3
      ref={ref}
      contentEditable={editable}
      suppressContentEditableWarning
      spellCheck={false}
      data-section-title
      data-placeholder="Section name"
      className={`flex-1 min-w-0 m-0! outline-none whitespace-pre-wrap break-words
        ${editable ? 'cursor-text' : 'cursor-default'}
        empty:before:content-[attr(data-placeholder)] empty:before:text-[#9CA3AF]`}
      onInput={(e) => {
        const el = e.currentTarget;
        if ((el.textContent ?? '') === '' && el.firstChild) el.innerHTML = '';
        onChange(el.textContent ?? '');
      }}
      onKeyDown={(e) => {
        const el = e.currentTarget;
        const text = el.textContent ?? '';
        if (e.key === 'Enter') {
          e.preventDefault();
          const { start, end } = caretOffsets(el, text);
          onEnter({ before: text.slice(0, start), after: text.slice(end) });
          return;
        }
        if (e.key === 'Backspace') {
          const { start, end } = caretOffsets(el, text);
          if (start === 0 && end === 0) {
            e.preventDefault();
            onBackspaceAtStart();
          }
          return;
        }
        if (e.key === 'Delete') {
          const { start, end } = caretOffsets(el, text);
          if (start === text.length && end === text.length) {
            e.preventDefault();
            onDeleteAtEnd();
          }
        }
      }}
      onPaste={(e) => {
        e.preventDefault();
        const text = e.clipboardData.getData('text/plain').replace(/\s*\n+\s*/g, ' ');
        document.execCommand('insertText', false, text);
      }}
    />
  );
});
