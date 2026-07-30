'use client';

import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

import { buildTemplate, layoutWidths, readColumnWidths, type ColumnWidths } from './compute-layout';
import { clearRenderedWidths, setRenderedWidths } from './rendered-widths';
import { scrollOffsetToReveal } from './scroll-into-view';
import { useColumnResize } from './use-column-resize';

interface UseTableLayoutOptions {
  tableId: string;
  orderedKeys: string[];
  storedWidths: unknown;
  enabled: boolean;
  onCommitWidths: (widths: ColumnWidths) => void;
}

export function useTableLayout({
  tableId,
  orderedKeys,
  storedWidths,
  enabled,
  onCommitWidths,
}: UseTableLayoutOptions) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => el.classList.toggle('is-scrolled', el.scrollLeft > 0);
    handleScroll();
    el.addEventListener('scroll', handleScroll);
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  const keysRef = useRef(orderedKeys);
  keysRef.current = orderedKeys;
  const tableIdRef = useRef(tableId);
  tableIdRef.current = tableId;
  const storedRef = useRef<ColumnWidths>({});
  storedRef.current = readColumnWidths(storedWidths);

  const baseWidthsRef = useRef<ColumnWidths>({});
  const availableRef = useRef(0);
  const dragWidthsRef = useRef<ColumnWidths | null>(null);
  const writtenRef = useRef('');
  const trackCountRef = useRef(0);

  const applyTemplate = useCallback(() => {
    const container = scrollRef.current;
    const actions = actionsRef.current;
    if (!container || !actions) return;

    const keys = keysRef.current;
    const trackCount = keys.length + 1;
    const scrollLeft = container.scrollLeft;

    if (trackCountRef.current !== trackCount) {
      trackCountRef.current = trackCount;
      writtenRef.current = '';
      container.style.gridTemplateColumns = `repeat(${keys.length}, minmax(0, 1fr)) max-content`;
    }

    const available = Math.max(0, container.clientWidth - actions.getBoundingClientRect().width);
    availableRef.current = available;
    baseWidthsRef.current = layoutWidths({ keys, stored: storedRef.current, available });
    setRenderedWidths(tableIdRef.current, baseWidthsRef.current);

    const template = buildTemplate(keys, dragWidthsRef.current ?? baseWidthsRef.current);
    if (template === writtenRef.current) return;
    writtenRef.current = template;
    container.style.gridTemplateColumns = template;

    if (scrollLeft && container.scrollLeft !== scrollLeft) {
      container.scrollLeft = scrollLeft;
    }
  }, []);

  useLayoutEffect(() => {
    if (enabled) applyTemplate();
  });

  const previousKeysRef = useRef<string[] | null>(null);
  useLayoutEffect(() => {
    const container = scrollRef.current;
    const previous = previousKeysRef.current;
    previousKeysRef.current = orderedKeys;
    if (!container || !previous || !enabled) return;

    const added = orderedKeys.find((key) => !previous.includes(key));
    if (!added) return;

    const cell = container.querySelector<HTMLElement>(
      `[data-col-header-cell][data-col-key="${added}"]`
    );
    if (!cell) return;

    const bounds = container.getBoundingClientRect();
    const offset = scrollOffsetToReveal(cell.getBoundingClientRect(), {
      left: bounds.left,
      right: bounds.right - (actionsRef.current?.getBoundingClientRect().width ?? 0),
    });
    if (offset !== 0) container.scrollBy({ left: offset, behavior: 'smooth' });

    cell.querySelector<HTMLTextAreaElement>('textarea')?.focus({ preventScroll: true });
  }, [orderedKeys, enabled]);

  useEffect(() => () => clearRenderedWidths(tableId), [tableId]);

  useEffect(() => {
    const container = scrollRef.current;
    const actions = actionsRef.current;
    if (!container || !actions || !enabled) return;
    const observer = new ResizeObserver(applyTemplate);
    observer.observe(container);
    observer.observe(actions);
    return () => observer.disconnect();
  }, [enabled, applyTemplate]);

  const widthsAfterResize = (key: string, targetPx: number) =>
    layoutWidths({
      keys: keysRef.current,
      stored: { ...baseWidthsRef.current, [key]: targetPx },
      available: availableRef.current,
      protectedKey: key,
    });

  const resize = useColumnResize({
    preview: (key, targetPx) => {
      dragWidthsRef.current = widthsAfterResize(key, targetPx);
      applyTemplate();
    },
    commit: (key, targetPx) => {
      const widths = widthsAfterResize(key, targetPx);
      dragWidthsRef.current = null;
      onCommitWidths(widths);
    },
  });

  return { scrollRef, actionsRef, resize };
}
