export const MIN_COL_PX = 60;

export const DEFAULT_NEW_COL_PX = 180;

const ACTIONS_TRACK = 'max-content';

export type ColumnWidths = Record<string, number>;

type LayoutInput = {
  keys: string[];
  stored: ColumnWidths;
  available: number;
  protectedKey?: string;
};

export function readColumnWidths(raw: unknown): ColumnWidths {
  if (!raw || typeof raw !== 'object') return {};
  const widths: ColumnWidths = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const px = typeof value === 'number' ? value : parseFloat(String(value));
    if (Number.isFinite(px) && px > 0) widths[key] = px;
  }
  return widths;
}

export function layoutWidths({ keys, stored, available, protectedKey }: LayoutInput): ColumnWidths {
  if (keys.length === 0) return {};

  const sizedTotal = keys.reduce((total, key) => total + (stored[key] ?? 0), 0);
  const unsizedCount = keys.reduce((count, key) => count + (stored[key] === undefined ? 1 : 0), 0);
  const seed = unsizedCount > 0 ? (available - sizedTotal) / unsizedCount : 0;

  const widths = keys.map((key) => Math.max(MIN_COL_PX, stored[key] ?? seed));
  const total = widths.reduce((sum, width) => sum + width, 0);

  const absorbers: number[] = [];
  keys.forEach((key, index) => {
    if (key !== protectedKey) absorbers.push(index);
  });

  if (available <= 0 || total > available || absorbers.length === 0) {
    return toWidthMap(keys, widths.map(Math.round));
  }

  const deficit = available - total;
  if (deficit > 0) {
    const absorberTotal = absorbers.reduce((sum, index) => sum + widths[index], 0);
    absorbers.forEach((index) => {
      const share = absorberTotal > 0 ? widths[index] / absorberTotal : 1 / absorbers.length;
      widths[index] += deficit * share;
    });
  }

  return toWidthMap(keys, roundToTotal(widths, absorbers, available));
}

function roundToTotal(widths: number[], absorbers: number[], target: number): number[] {
  const rounded = widths.map(Math.round);
  let drift = target - rounded.reduce((sum, width) => sum + width, 0);
  const step = drift > 0 ? 1 : -1;

  for (let pass = 0; drift !== 0 && pass < absorbers.length * 2; pass++) {
    const index = absorbers[pass % absorbers.length];
    if (step < 0 && rounded[index] <= MIN_COL_PX) continue;
    rounded[index] += step;
    drift -= step;
  }

  return rounded;
}

export function buildTemplate(keys: string[], widths: ColumnWidths): string {
  const tracks = keys.map((key) => `${widths[key] ?? MIN_COL_PX}px`);
  return [...tracks, ACTIONS_TRACK].join(' ');
}

function toWidthMap(keys: string[], widths: number[]): ColumnWidths {
  const map: ColumnWidths = {};
  keys.forEach((key, index) => {
    map[key] = widths[index];
  });
  return map;
}
