import type { JSONContent } from '@tiptap/core';

export type CopiedVitalInput = {
  name: string;
  value: string;
  unit: string;
  vitalId?: string;
  ekaId?: string;
  availableUnits?: string[];
  date?: string;
  source?: 'grid' | 'history';
  readings?: { value: string; unit: string; date: string }[];
  refRange?: string;
  status?: 'high' | 'low' | 'normal' | 'unknown';
};

type ReadingLike = { value: string; unit?: string; date?: string };

type LabResultTableLocation =
  | { kind: 'bare'; index: number }
  | { kind: 'wrapped'; sectionIndex: number; childIndex: number };

function sameReading(a: ReadingLike, b: ReadingLike): boolean {
  return a.value.trim() === (b.value ?? '').trim() && (a.date ?? '') === (b.date ?? '');
}

function isKnownReading(candidate: ReadingLike, primary: ReadingLike, trend: ReadingLike[]): boolean {
  return sameReading(candidate, primary) || trend.some((t) => sameReading(candidate, t));
}

function mapOutOfRange(status: CopiedVitalInput['status']): string {
  switch (status) {
    case 'high':
      return 'High';
    case 'low':
      return 'Low';
    case 'normal':
      return 'Normal';
    default:
      return '';
  }
}

export function buildLabResultRowNode(input: CopiedVitalInput): JSONContent {
  const primaryReading: ReadingLike = { value: input.value, unit: input.unit, date: input.date ?? '' };
  const readings = (input.readings ?? []).map((r) => ({ value: r.value, unit: r.unit, date: r.date }));
  const trend = [
    ...(input.value.trim() ? [primaryReading] : []),
    ...readings.filter((r) => !sameReading(r, primaryReading)),
  ];
  return {
    type: 'labResultRow',
    attrs: {
      test_name: input.name,
      value: input.value,
      unit: input.unit,
      reference_range: input.refRange ?? '',
      out_of_range: mapOutOfRange(input.status),
      vitalId: input.vitalId ?? '',
      ekaId: input.ekaId ?? '',
      availableUnits: input.availableUnits ?? [],
      date: input.date ?? '',
      customFields: {},
      trend,
      pendingConflict: null,
    },
  };
}

function wrapInLabResultSection(table: JSONContent, order: number): JSONContent {
  return {
    type: 'sectionBlock',
    attrs: {
      sectionKey: (table.attrs?.sectionKey as string) ?? '',
      kind: 'LAB_RESULTS',
      displayName: 'Lab Results',
      order,
      statusState: 'ready',
      statusError: null,
      editedByUser: true,
    },
    content: [table],
  };
}

export function buildLabResultSectionBlock(rows: JSONContent[], order: number): JSONContent {
  return wrapInLabResultSection(
    {
      type: 'labResultTable',
      attrs: { sectionKey: '', columns: [], hiddenColumns: ['reference_range', 'out_of_range'] },
      content: rows,
    },
    order
  );
}

export function buildEmptyLabResultTable(sectionKey: string): JSONContent {
  return {
    type: 'labResultTable',
    attrs: { sectionKey, columns: [], hiddenColumns: [] },
    content: [{ type: 'labResultRow' }],
  };
}

export function buildEmptyLabResultSection(sectionKey: string, order: number): JSONContent {
  return wrapInLabResultSection(buildEmptyLabResultTable(sectionKey), order);
}

function locateLabResultTable(content: JSONContent[]): LabResultTableLocation | null {
  for (let i = 0; i < content.length; i++) {
    const node = content[i];
    if (node.type === 'labResultTable') return { kind: 'bare', index: i };
    if (node.type === 'sectionBlock') {
      const childIndex = (node.content ?? []).findIndex((child) => child.type === 'labResultTable');
      if (childIndex !== -1) return { kind: 'wrapped', sectionIndex: i, childIndex };
    }
  }
  return null;
}

function getLabResultTable(content: JSONContent[], location: LabResultTableLocation): JSONContent {
  return location.kind === 'bare' ? content[location.index] : (content[location.sectionIndex].content ?? [])[location.childIndex];
}

function replaceLabResultTable(
  content: JSONContent[],
  location: LabResultTableLocation,
  table: JSONContent
): JSONContent[] {
  if (location.kind === 'bare') {
    return content.map((n, i) => (i === location.index ? table : n));
  }
  return content.map((n, i) => {
    if (i !== location.sectionIndex) return n;
    const children = n.content ?? [];
    return { ...n, content: children.map((c, j) => (j === location.childIndex ? table : c)) };
  });
}

// Merges incoming copy-to-note vitals into whichever labResultTable already
// exists in the note — the SAME node type AI-streamed LAB_RESULTS sections
// use, matched structurally (by node type, nested inside a sectionBlock or
// bare — never by reading the section's displayName text, so renaming it
// never breaks the merge). Creates a new sectionBlock + labResultTable,
// matching the AI-streamed structure, if none exists yet.
//
// Matching against an existing row is eka-ID-first, vital-ID-fallback —
// never by test name.
//   1. If the incoming row has an ekaId, look for an existing row whose
//      ekaId attr equals it. (ekaId is the MDB inv-readings catalog id —
//      shared ID space across manual autocomplete selections and
//      medical-records-ui pastes, so this is the strongest match.)
//   2. Only if no ekaId match was found (ekaId absent on the incoming row,
//      or present but no existing row has that ekaId) fall back to
//      matching on vitalId (the source record's own per-reading id —
//      meaningful only between two pastes of literally the same reading
//      instance, e.g. across repeated copy-to-note actions).
// A row with neither id set always creates a new row rather than guessing
// at a name match.
//
// For a matched row:
//   - 'history' source: every incoming point (primary + extras) is just a
//     dated reading — deduped against the row's current value and its
//     existing trend, then appended to trend. The row's current value is
//     never touched and there's never a conflict prompt.
//   - 'grid' source: raises a pendingConflict only when the incoming value
//     or unit actually differs from the row's current value/unit — an
//     identical grid copy is a no-op (nothing to resolve, so no conflict
//     prompt). Any extra readings bundled with a grid copy still auto-merge
//     into trend unconditionally either way, same as history.
export function mergeCopiedVitalsIntoLabResults(
  baseContent: JSONContent[],
  incoming: CopiedVitalInput[]
): JSONContent[] {
  const location = locateLabResultTable(baseContent);

  if (!location) {
    const rows = incoming.map((item) => buildLabResultRowNode(item));
    return [...baseContent, buildLabResultSectionBlock(rows, baseContent.length)];
  }

  const table = getLabResultTable(baseContent, location);
  let rows = table.content ?? [];

  for (const item of incoming) {
    const ekaId = item.ekaId?.trim();
    const vitalId = item.vitalId?.trim();
    let existingIdx = ekaId ? rows.findIndex((r) => (r.attrs?.ekaId ?? '') === ekaId) : -1;
    if (existingIdx === -1 && vitalId) {
      existingIdx = rows.findIndex((r) => (r.attrs?.vitalId ?? '') === vitalId);
    }

    if (existingIdx === -1) {
      rows = [...rows, buildLabResultRowNode(item)];
      continue;
    }

    const existing = rows[existingIdx];
    const existingAttrs = existing.attrs as Record<string, unknown>;
    const existingPrimary: ReadingLike = {
      value: String(existingAttrs.value ?? ''),
      date: String(existingAttrs.date ?? ''),
    };
    const existingTrend = (existingAttrs.trend ?? []) as ReadingLike[];
    const source = item.source ?? 'grid';

    if (source === 'history') {
      const candidates: ReadingLike[] = [
        { value: item.value, unit: item.unit, date: item.date ?? '' },
        ...(item.readings ?? []),
      ];
      const newEntries = candidates.filter((c) => !isKnownReading(c, existingPrimary, existingTrend));
      if (newEntries.length === 0) continue;
      rows = rows.map((r, i) =>
        i === existingIdx ? { ...r, attrs: { ...existingAttrs, trend: [...existingTrend, ...newEntries] } } : r
      );
      continue;
    }

    const extras = (item.readings ?? []).filter((r) => !isKnownReading(r, existingPrimary, existingTrend));
    const mergedTrend = extras.length > 0 ? [...existingTrend, ...extras] : existingTrend;

    const existingUnit = String(existingAttrs.unit ?? '').trim();
    const sameAsCurrent =
      item.value.trim() === existingPrimary.value.trim() && (item.unit ?? '').trim() === existingUnit;

    rows = rows.map((r, i) => {
      if (i !== existingIdx) return r;
      if (sameAsCurrent) {
        return { ...r, attrs: { ...existingAttrs, trend: mergedTrend } };
      }
      return {
        ...r,
        attrs: {
          ...existingAttrs,
          trend: mergedTrend,
          pendingConflict: { value: item.value, unit: item.unit, date: item.date },
        },
      };
    });
  }

  return replaceLabResultTable(baseContent, location, { ...table, content: rows });
}

export function copiedVitalsToMarkdownBlock(rows: CopiedVitalInput[]): string {
  return rows
    .map((r) => `**${r.name}**: ${[r.value, r.unit].filter(Boolean).join(' ').trim() || '—'}`)
    .join('\n\n');
}
