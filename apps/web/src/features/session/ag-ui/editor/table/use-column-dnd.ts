'use client';

import { useCallback, useState, type RefObject } from 'react';
import { PointerSensor, useSensor, useSensors, type DragEndEvent, type DragOverEvent, type DragStartEvent } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';

import { setTableUIState } from './table-ui-store';

type ColumnOverlaySnapshot = { width: number; html: string };

function captureColumnSnapshot(scrollEl: HTMLElement, key: string): ColumnOverlaySnapshot | null {
  const headerEl = scrollEl.querySelector<HTMLElement>(`[data-col-header-cell][data-col-key="${key}"]`);
  if (!headerEl) return null;
  const width = headerEl.getBoundingClientRect().width;
  const wrapper = document.createElement('div');
  wrapper.appendChild(headerEl.cloneNode(true));
  scrollEl.querySelectorAll<HTMLElement>(`[data-col-cell][data-col-key="${key}"]`).forEach((cellEl) => {
    wrapper.appendChild(cellEl.cloneNode(true));
  });
  return { width, html: wrapper.innerHTML };
}

interface UseColumnDndOptions {
  tableId: string;
  orderedKeys: string[];
  scrollRef: RefObject<HTMLDivElement | null>;
  onCommitOrder: (order: string[]) => void;
}

export function useColumnDnd({ tableId, orderedKeys, scrollRef, onCommitOrder }: UseColumnDndOptions) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const [overlaySnapshot, setOverlaySnapshot] = useState<ColumnOverlaySnapshot | null>(null);

  const onDragStart = useCallback(
    (e: DragStartEvent) => {
      const key = String(e.active.id);
      setTableUIState(tableId, { dragOrder: orderedKeys, dragActiveKey: key });
      setOverlaySnapshot(scrollRef.current ? captureColumnSnapshot(scrollRef.current, key) : null);
    },
    [orderedKeys, tableId, scrollRef]
  );

  const onDragOver = useCallback(
    (e: DragOverEvent) => {
      const { active, over } = e;
      const activeKey = String(active.id);
      const oldIndex = orderedKeys.indexOf(activeKey);
      const newIndex = over ? orderedKeys.indexOf(String(over.id)) : -1;
      const reordered = oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex;
      setTableUIState(tableId, {
        dragOrder: reordered ? arrayMove(orderedKeys, oldIndex, newIndex) : orderedKeys,
        dragActiveKey: activeKey,
      });
    },
    [orderedKeys, tableId]
  );

  const onDragCancel = useCallback(() => {
    setOverlaySnapshot(null);
    setTableUIState(tableId, { dragOrder: null, dragActiveKey: null });
  }, [tableId]);

  const onDragEnd = useCallback(
    (e: DragEndEvent) => {
      onDragCancel();
      const { active, over } = e;
      if (!over || active.id === over.id) return;
      const oldIndex = orderedKeys.indexOf(String(active.id));
      const newIndex = orderedKeys.indexOf(String(over.id));
      if (oldIndex === -1 || newIndex === -1) return;
      onCommitOrder(arrayMove(orderedKeys, oldIndex, newIndex));
    },
    [orderedKeys, onCommitOrder, onDragCancel]
  );

  return { sensors, overlaySnapshot, onDragStart, onDragOver, onDragEnd, onDragCancel };
}
