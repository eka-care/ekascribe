import type { ITransport, TransportResponse } from '../contracts';
import { getTransport } from '@/transport';

/**
 * Web network capability — a thin adapter over the existing runtime transport
 * (`src/transport/`). Formalizes the seam under the layer without changing the proven
 * fetch flow; `getTransport()` resolves to the HTTP transport on web.
 */
export const networkWeb: ITransport = {
  request: (url: string, init?: RequestInit): Promise<TransportResponse> =>
    getTransport().request(url, init),
};
