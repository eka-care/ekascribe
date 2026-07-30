import type { ITransport, TransportResponse } from './types';

/**
 * HTTP transport — thin wrapper around native `fetch()`.
 * The native Response satisfies TransportResponse (status, ok, json, text).
 */
export class HttpTransport implements ITransport {
  async request(url: string, init?: RequestInit): Promise<TransportResponse> {
    return fetch(url, init);
  }
}
