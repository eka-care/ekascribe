'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type JumpDirection = 'up' | 'down';

interface JumpToSelectedState {
  visible: boolean;
  direction: JumpDirection;
}

const HIDDEN: JumpToSelectedState = { visible: false, direction: 'down' };

const ACTIVE_ITEM_SELECTOR = '[data-jump-active="true"]';

export function useJumpToSelected(activeId: unknown, listKey: unknown) {
  const scrollBodyRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<JumpToSelectedState>(HIDDEN);

  const evaluate = useCallback(() => {
    const body = scrollBodyRef.current;
    const active = body?.querySelector<HTMLElement>(ACTIVE_ITEM_SELECTOR) ?? null;

    if (!body || !active) {
      setState((s) => (s.visible ? HIDDEN : s));
      return;
    }

    const bodyRect = body.getBoundingClientRect();
    const itemRect = active.getBoundingClientRect();

    if (itemRect.bottom <= bodyRect.top) {
      setState({ visible: true, direction: 'up' });
    } else if (itemRect.top >= bodyRect.bottom) {
      setState({ visible: true, direction: 'down' });
    } else {
      setState((s) => (s.visible ? HIDDEN : s));
    }
  }, [activeId]);

  useEffect(() => {
    const body = scrollBodyRef.current;
    if (!body) return;
    body.addEventListener('scroll', evaluate, { passive: true });
    window.addEventListener('resize', evaluate);
    return () => {
      body.removeEventListener('scroll', evaluate);
      window.removeEventListener('resize', evaluate);
    };
  }, [evaluate]);

  useEffect(() => {
    evaluate();
  }, [evaluate, listKey]);

  const jumpToSelected = useCallback(() => {
    scrollBodyRef.current
      ?.querySelector<HTMLElement>(ACTIVE_ITEM_SELECTOR)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  return {
    scrollBodyRef,
    showChip: state.visible,
    direction: state.direction,
    jumpToSelected,
  };
}
