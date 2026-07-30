import type { ColumnWidths } from './compute-layout';

const rendered = new Map<string, ColumnWidths>();

export function setRenderedWidths(tableId: string, widths: ColumnWidths): void {
  rendered.set(tableId, widths);
}

export function getRenderedWidths(tableId: string): ColumnWidths {
  return rendered.get(tableId) ?? {};
}

export function clearRenderedWidths(tableId: string): void {
  rendered.delete(tableId);
}
