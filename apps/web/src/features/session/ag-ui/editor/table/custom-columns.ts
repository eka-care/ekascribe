import type { CustomColumn } from './types';

export function normalizeCustomColumns(raw: unknown): CustomColumn[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => (typeof entry === 'string' ? { key: entry, label: entry } : (entry as CustomColumn)));
}

export function generateCustomColumnKey(): string {
  return `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}
