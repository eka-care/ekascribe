'use client';

import { useEffect, type RefObject } from 'react';

const pending = new Set<HTMLTextAreaElement>();
const lastWidth = new WeakMap<HTMLTextAreaElement, number>();
let frame = 0;

function flush(): void {
  frame = 0;
  const elements = [...pending].filter((el) => el.isConnected);
  pending.clear();

  const growing: HTMLTextAreaElement[] = [];
  for (const el of elements) {
    if (!el.value) {
      el.style.height = '';
      continue;
    }
    el.style.height = 'auto';
    growing.push(el);
  }

  const measured = growing.map((el) => ({ height: el.scrollHeight, width: el.clientWidth }));

  growing.forEach((el, index) => {
    el.style.height = `${measured[index].height}px`;
    lastWidth.set(el, measured[index].width);
  });
}

function schedule(el: HTMLTextAreaElement): void {
  pending.add(el);
  if (!frame) frame = requestAnimationFrame(flush);
}

function measureNow(el: HTMLTextAreaElement): void {
  if (!el.value) {
    el.style.height = '';
    return;
  }
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
  lastWidth.set(el, el.clientWidth);
}

export function useAutosizeTextarea(ref: RefObject<HTMLTextAreaElement | null>, value: string) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    measureNow(el);

    const observer = new ResizeObserver(() => {
      if (lastWidth.get(el) === el.clientWidth) return;
      schedule(el);
    });
    observer.observe(el);

    return () => {
      observer.disconnect();
      pending.delete(el);
    };
  }, [ref, value]);
}
