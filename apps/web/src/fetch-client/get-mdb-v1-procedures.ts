import fetchWrapper from '.';
import { GET_MDB_HOST } from './helper';
import { tracker } from '@/analytics';

export type TProcedureResult = {
  id: string;
  name: string;
  common_name?: string;
};

type Params = {
  q: string;
  limit?: number;
  flavour?: string;
  docid?: string;
  signal?: AbortSignal;
};

export async function getMdbV1Procedures({
  q,
  limit = 8,
  flavour = 'dw',
  docid,
  signal,
}: Params): Promise<{ status_code: number; data?: TProcedureResult[]; error?: string }> {
  try {
    const params = new URLSearchParams({ q, limit: String(limit), flavour });
    if (docid) params.set('docid', docid);

    const response = await fetchWrapper(
      `${GET_MDB_HOST()}/v1/procedures?${params.toString()}`,
      { method: 'GET', signal }
    );

    const data = await response.json();

    return { status_code: response.status, data: Array.isArray(data) ? data : [] };
  } catch (error) {
    tracker.error(error, { domain: 'api', component: 'mdb', extra: { action: 'procedures', query: q } });
    return {
      status_code: 500,
      error: error instanceof Error ? error.message : 'Failed to search procedures',
    };
  }
}
