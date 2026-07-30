import { getMdbV1InvReadings } from '@/fetch-client/get-mdb-v1-inv-readings';
import type { CopiedVitalInput } from './lab-result-mapper';

// The MDB inv-readings endpoint only supports a single-name search (no
// batch/multi-name or by-ids lookup), so codifying N distinct vital names
// still means N requests. Cap how many run at once so a large paste (e.g.
// 100+ distinct vitals) doesn't burst the server with 100 simultaneous calls.
const CODIFY_CONCURRENCY = 6;

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function codifyVitalRows(
  rows: CopiedVitalInput[],
  docid: string | undefined
): Promise<CopiedVitalInput[]> {
  const uniqueNames = [...new Set(rows.filter((r) => r.ekaId?.trim()).map((r) => r.name.trim()))];
  if (uniqueNames.length === 0) return rows;

  const entries = await mapLimit(uniqueNames, CODIFY_CONCURRENCY, async (name) => {
    const res = await getMdbV1InvReadings({ q: name, limit: 8, docid });
    return [name, res.data ?? []] as const;
  });
  const resultsByName = new Map(entries);

  return rows.map((row) => {
    const ekaId = row.ekaId?.trim();
    if (!ekaId) return row;
    const match = (resultsByName.get(row.name.trim()) ?? []).find((c) => c.id === ekaId);
    const availableUnits = match?.all_units?.map((u) => u.name) ?? [];
    if (availableUnits.length === 0) return row;
    return { ...row, availableUnits, unit: row.unit.trim() ? row.unit : (availableUnits[0] ?? row.unit) };
  });
}
