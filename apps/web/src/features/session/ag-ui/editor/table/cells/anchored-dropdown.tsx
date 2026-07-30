'use client';

import { forwardRef, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface AnchoredDropdownProps {
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  onDismiss: () => void;
  className?: string;
  align?: 'left' | 'right';
  children: React.ReactNode;
}

const GAP = 4;
const VIEWPORT_MARGIN = 8;

interface AnchorRect {
  top: number;
  bottom: number;
  left: number;
  rightOffset: number;
  width: number;
}

interface Placement {
  openUp: boolean;
  maxHeight: number | null;
}

const DEFAULT_PLACEMENT: Placement = { openUp: false, maxHeight: null };

export const AnchoredDropdown = forwardRef<HTMLDivElement, AnchoredDropdownProps>(
  ({ anchorRef, open, onDismiss, className, align = 'left', children }, ref) => {
    const [rect, setRect] = useState<AnchorRect | null>(null);
    const [placement, setPlacement] = useState<Placement>(DEFAULT_PLACEMENT);
    const innerRef = useRef<HTMLDivElement | null>(null);

    useLayoutEffect(() => {
      if (!open || !anchorRef.current) {
        setRect(null);
        setPlacement(DEFAULT_PLACEMENT);
        return;
      }
      const r = anchorRef.current.getBoundingClientRect();
      setRect({
        top: r.top,
        bottom: r.bottom,
        left: r.left,
        rightOffset: window.innerWidth - r.right,
        width: r.width,
      });
    }, [open, anchorRef]);

    useLayoutEffect(() => {
      const el = innerRef.current;
      if (!rect || !el) return;

      const clamped = el.style.maxHeight;
      el.style.maxHeight = '';
      const naturalHeight = el.getBoundingClientRect().height;
      el.style.maxHeight = clamped;

      const spaceBelow = window.innerHeight - rect.bottom - GAP - VIEWPORT_MARGIN;
      const spaceAbove = rect.top - GAP - VIEWPORT_MARGIN;
      const openUp = naturalHeight > spaceBelow && spaceAbove > spaceBelow;
      const available = openUp ? spaceAbove : spaceBelow;
      const maxHeight = naturalHeight > available ? Math.max(0, available) : null;

      setPlacement((prev) =>
        prev.openUp === openUp && prev.maxHeight === maxHeight ? prev : { openUp, maxHeight }
      );
    }, [rect, children]);

    useEffect(() => {
      if (!open) return;
      const handleScroll = (e: Event) => {
        if (innerRef.current?.contains(e.target as Node)) return;
        onDismiss();
      };
      window.addEventListener('scroll', handleScroll, true);
      window.addEventListener('resize', onDismiss);
      return () => {
        window.removeEventListener('scroll', handleScroll, true);
        window.removeEventListener('resize', onDismiss);
      };
    }, [open, onDismiss]);

    const setRefs = useCallback(
      (node: HTMLDivElement | null) => {
        innerRef.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
      },
      [ref]
    );

    if (!open || !rect) return null;

    return createPortal(
      <div
        ref={setRefs}
        className={className}
        style={{
          position: 'fixed',
          ...(placement.openUp
            ? { bottom: window.innerHeight - rect.top + GAP }
            : { top: rect.bottom + GAP }),
          ...(align === 'right' ? { right: rect.rightOffset } : { left: rect.left }),
          ...(placement.maxHeight != null ? { maxHeight: placement.maxHeight, overflowY: 'auto' } : {}),
          minWidth: rect.width,
          zIndex: 60,
        }}
      >
        {children}
      </div>,
      document.body
    );
  }
);
AnchoredDropdown.displayName = 'AnchoredDropdown';
