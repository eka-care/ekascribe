import fetchWrapper from '.';
import { GET_MDB_HOST } from './helper';
import type { TGetMdbV1DrugsAndLabsResponse } from '@/constants/types';
import { tracker } from '@/analytics';

type Params = {
  q: string;
  limit?: number;
  showCustom?: boolean;
  searchType?: 'drug' | 'lab' | 'both';
  flavour?: string;
  docid?: string;
  signal?: AbortSignal;
};

export async function getMdbV1DrugsAndLabs({
  q,
  limit = 8,
  showCustom = true,
  searchType = 'drug',
  flavour = 'dw',
  docid,
  signal,
}: Params): Promise<TGetMdbV1DrugsAndLabsResponse> {
  try {
    const params = new URLSearchParams({
      q,
      limit: String(limit),
      show_custom: String(showCustom),
      s_type: searchType,
      flavour,
    });
    if (docid) params.set('docid', docid);

    const response = await fetchWrapper(
      `${GET_MDB_HOST()}/v1/drugs-and-labs?${params.toString()}`,
      { method: 'GET', signal }
    );

    const data = await response.json();

    return {
      status_code: response.status,
      data,
    };
  } catch (error) {
    tracker.error(error, { domain: 'api', component: 'mdb', extra: { action: 'drugs_and_labs', query: q } });
    return {
      status_code: 500,
      error: error instanceof Error ? error.message : 'Failed to search drugs',
    };
  }
}
