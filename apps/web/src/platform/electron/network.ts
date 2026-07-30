import type { ITransport, TransportResponse } from '../contracts';

/**
 * Electron network capability — routes every request through `window.networkApi.request`
 * (the preload IPC bridge → main-process `net.fetch`). The main process automatically
 * injects the stored `auth` header, so requests are always authenticated without the
 * renderer needing to manage tokens directly.
 */
export const networkElectron: ITransport = {
  async request(url: string, init?: RequestInit): Promise<TransportResponse> {
    const api = (window as any).networkApi; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (typeof api?.request !== 'function') {
      throw new Error('[networkElectron] window.networkApi not available');
    }

    const headers: Record<string, string> = {};
    if (init?.headers) {
      if (init.headers instanceof Headers) {
        init.headers.forEach((v, k) => { headers[k] = v; });
      } else if (Array.isArray(init.headers)) {
        for (const [k, v] of init.headers) headers[k] = v;
      } else {
        Object.assign(headers, init.headers as Record<string, string>);
      }
    }

    let body: string | null = null;
    if (init?.body != null) {
      body = typeof init.body === 'string' ? init.body : String(init.body);
    }

    const ipc: { ok: boolean; status: number; statusText: string; body: string } =
      await api.request({
        url: url as string,
        method: (init?.method ?? 'GET').toUpperCase(),
        headers,
        body,
        retry: false,
        ekaHost: '',
      });

    return {
      ok: ipc.ok,
      status: ipc.status,
      json: async () => (typeof ipc.body === 'string' ? JSON.parse(ipc.body) : ipc.body),
      text: async () => (typeof ipc.body === 'string' ? ipc.body : JSON.stringify(ipc.body)),
    };
  },
};
