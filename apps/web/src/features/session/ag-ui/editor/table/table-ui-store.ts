'use client';

import { useCallback, useSyncExternalStore } from 'react';

type TableUIState = {
  dragOrder: string[] | null;
  dragActiveKey: string | null;
  deleteHoverKey: string | null;
};

const EMPTY_STATE: TableUIState = { dragOrder: null, dragActiveKey: null, deleteHoverKey: null };

const states = new Map<string, TableUIState>();
const listeners = new Map<string, Set<() => void>>();

function snapshot(id: string): TableUIState {
  return states.get(id) ?? EMPTY_STATE;
}

function sameOrder(a: string[] | null, b: string[] | null): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a.every((key, index) => key === b[index]);
}

export function setTableUIState(id: string, patch: Partial<TableUIState>): void {
  const current = snapshot(id);
  const next = { ...current, ...patch };
  if (
    next.dragActiveKey === current.dragActiveKey &&
    next.deleteHoverKey === current.deleteHoverKey &&
    sameOrder(next.dragOrder, current.dragOrder)
  ) {
    return;
  }

  if (!next.dragOrder && !next.dragActiveKey && !next.deleteHoverKey) {
    states.delete(id);
  } else {
    states.set(id, next);
  }

  listeners.get(id)?.forEach((listener) => listener());
}

export function useTableUIState(id: string): TableUIState {
  const subscribe = useCallback(
    (onChange: () => void) => {
      let subscribers = listeners.get(id);
      if (!subscribers) {
        subscribers = new Set();
        listeners.set(id, subscribers);
      }
      subscribers.add(onChange);
      return () => {
        subscribers.delete(onChange);
        if (subscribers.size === 0) listeners.delete(id);
      };
    },
    [id]
  );

  const getSnapshot = useCallback(() => snapshot(id), [id]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
