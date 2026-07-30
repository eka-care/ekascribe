'use client';

import { useEffect, useRef } from 'react';

import useVoice2RxStore from '@/store/store';

export function usePasteScroll(sessionId: string, documentId: string, ready: boolean) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const pendingScrollDocId = useVoice2RxStore(
    (s) => s.sessionV2ContentById[sessionId]?.ui?.pending_paste_scroll_doc_id ?? null
  );

  useEffect(() => {
    if (!ready || pendingScrollDocId !== documentId) return;
    const container = scrollContainerRef.current;
    if (!container) return;

    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        const table = container.querySelector<HTMLElement>('.lab-result-table');
        const rows = table?.querySelectorAll<HTMLElement>('.lab-result-row');
        const target = rows?.length ? rows[rows.length - 1] : table;
        if (target) {
          const containerRect = container.getBoundingClientRect();
          const targetRect = target.getBoundingClientRect();
          const centerGap = Math.max(0, (container.clientHeight - targetRect.height) / 2);
          const top = container.scrollTop + (targetRect.top - containerRect.top) - centerGap;
          container.scrollTo({ top, behavior: 'smooth' });
        } else {
          container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
        }
        useVoice2RxStore
          .getState()
          .setSessionV2Ui(sessionId, { pending_paste_scroll_doc_id: null });
      });
    });

    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [ready, pendingScrollDocId, documentId, sessionId]);

  return scrollContainerRef;
}
