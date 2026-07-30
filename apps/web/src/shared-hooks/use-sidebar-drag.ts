import { useRef, useCallback, useEffect, useState } from 'react';
import { getStorage } from '@/platform';

const MIN_WIDTH = 220;
const MAX_WIDTH = 480;
const DEFAULT_WIDTH = 256;
const STORAGE_KEY = 'sidebar-width';

function readStoredWidth(): number {
  const stored = getStorage().session.get(STORAGE_KEY);
  const parsed = stored ? parseInt(stored, 10) : NaN;
  return isNaN(parsed) ? DEFAULT_WIDTH : Math.min(Math.max(parsed, MIN_WIDTH), MAX_WIDTH);
}

export function useSidebarDrag() {
  const [sidebarWidth, setSidebarWidth] = useState(readStoredWidth);

  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);
  const rafId = useRef<number | null>(null);
  const widthRef = useRef(sidebarWidth);

  // Keep ref in sync so onHandleMouseDown doesn't need sidebarWidth as a dep
  widthRef.current = sidebarWidth;

  const cancelPendingRaf = useCallback(() => {
    if (rafId.current !== null) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }
  }, []);

  const resetBodyStyles = useCallback(() => {
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  const onMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging.current) return;
      cancelPendingRaf();
      rafId.current = requestAnimationFrame(() => {
        const delta = e.clientX - startX.current;
        const next = Math.min(Math.max(startWidth.current + delta, MIN_WIDTH), MAX_WIDTH);
        setSidebarWidth(next);
      });
    },
    [cancelPendingRaf]
  );

  const onMouseUp = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;
    cancelPendingRaf();
    resetBodyStyles();
    setSidebarWidth((w) => {
      getStorage().session.set(STORAGE_KEY, String(w));
      return w;
    });
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  }, [onMouseMove, cancelPendingRaf, resetBodyStyles]);

  const onHandleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDragging.current = true;
      startX.current = e.clientX;
      startWidth.current = widthRef.current;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    },
    [onMouseMove, onMouseUp]
  );

  useEffect(() => {
    return () => {
      cancelPendingRaf();
      resetBodyStyles();
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [onMouseMove, onMouseUp, cancelPendingRaf, resetBodyStyles]);

  return { sidebarWidth, onHandleMouseDown };
}
