import type { ITransport, TransportResponse, IpcBridge, IpcRequest } from './types';

const IPC_TIMEOUT_MS = 15_000;

/**
 * IPC transport — routes all requests through the consumer-provided bridge
 * instead of using `fetch()`. Used in Electron / desktop environments.
 */
export class IpcTransport implements ITransport {
  private bridge: IpcBridge;
  private pendingRequests = new Map<
    string,
    { resolve: (res: TransportResponse) => void; reject: (err: Error) => void }
  >();
  private counter = 0;

  constructor(bridge: IpcBridge) {
    this.bridge = bridge;
    this.bridge.onResponse((response) => {
      const pending = this.pendingRequests.get(response.correlationId);
      if (!pending) return;

      this.pendingRequests.delete(response.correlationId);

      if (response.error) {
        pending.reject(new Error(response.error));
        return;
      }

      const status = response.status;
      pending.resolve({
        status,
        ok: status >= 200 && status < 300,
        json: async () =>
          typeof response.body === 'string' ? JSON.parse(response.body) : response.body,
        text: async () =>
          typeof response.body === 'string' ? response.body : JSON.stringify(response.body),
      });
    });
  }

  async request(url: string, init?: RequestInit): Promise<TransportResponse> {
    const correlationId = `ipc_${Date.now()}_${++this.counter}`;
    const headers = normalizeHeaders(init?.headers);

    const ipcRequest: IpcRequest = {
      correlationId,
      method: init?.method || 'GET',
      url,
      headers,
      body: typeof init?.body === 'string' ? init.body : undefined,
    };

    return new Promise<TransportResponse>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(correlationId);
        reject(new Error(`IPC request timed out: ${init?.method || 'GET'} ${url}`));
      }, IPC_TIMEOUT_MS);

      this.pendingRequests.set(correlationId, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });

      this.bridge.send(ipcRequest);
    });
  }

  destroy() {
    for (const [id, pending] of this.pendingRequests) {
      pending.reject(new Error('IPC transport destroyed'));
      this.pendingRequests.delete(id);
    }
  }
}

function normalizeHeaders(headers?: HeadersInit): Record<string, string> | undefined {
  if (!headers) return undefined;

  if (headers instanceof Headers) {
    const result: Record<string, string> = {};
    headers.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  if (Array.isArray(headers)) {
    const result: Record<string, string> = {};
    for (const [key, value] of headers) {
      result[key] = value;
    }
    return result;
  }

  return headers as Record<string, string>;
}
