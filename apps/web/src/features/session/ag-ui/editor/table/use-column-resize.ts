'use client';

import { useCallback, useRef, useState } from 'react';

import { MIN_COL_PX } from './compute-layout';

interface UseColumnResizeOptions {
  onStart?: (key: string) => void;
  preview: (key: string, targetPx: number) => void;
  commit: (key: string, targetPx: number) => void;
}

export function useColumnResize({ onStart, preview, commit }: UseColumnResizeOptions) {
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const cbRef = useRef({ onStart, preview, commit });
  cbRef.current = { onStart, preview, commit };

  const beginDrag = useCallback((key: string, startClientX: number, startWidth: number) => {
    cbRef.current.onStart?.(key);
    setActiveKey(key);
    const targetAt = (clientX: number) => Math.max(MIN_COL_PX, Math.round(startWidth + (clientX - startClientX)));

    let latestX = startClientX;
    let raf = 0;

    const flush = () => {
      raf = 0;
      cbRef.current.preview(key, targetAt(latestX));
    };

    const handleMove = (e: PointerEvent) => {
      latestX = e.clientX;
      if (!raf) raf = requestAnimationFrame(flush);
    };

    const handleUp = (e: PointerEvent) => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      if (raf) cancelAnimationFrame(raf);
      cbRef.current.commit(key, targetAt(e.clientX));
      setActiveKey(null);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  }, []);

  const getHandleProps = useCallback(
    (key: string) => ({
      'data-col-resize-handle': true,
      onMouseDown: (e: React.MouseEvent) => e.stopPropagation(),
      onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
        e.preventDefault();
        e.stopPropagation();
        const cell = e.currentTarget.closest('[data-col-header-cell]') as HTMLElement | null;
        const startWidth = cell?.getBoundingClientRect().width ?? MIN_COL_PX;
        beginDrag(key, e.clientX, startWidth);
      },
    }),
    [beginDrag]
  );

  return {
    isResizing: activeKey !== null,
    activeKey,
    getHandleProps,
  };
}
