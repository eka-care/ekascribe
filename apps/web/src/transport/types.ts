import type { IpcBridge, IpcRequest, IpcResponse } from 'med-scribe-alliance-ts-sdk';

/**
 * Minimal response interface that both native `Response` (HTTP mode)
 * and our IPC-constructed response satisfy.
 */
export interface TransportResponse {
  status: number;
  ok: boolean;
  json(): Promise<any>;
  text(): Promise<string>;
}

/**
 * Transport abstraction — same signature as `fetch()` so migration is trivial.
 * In HTTP mode this is a thin wrapper around `fetch`.
 * In IPC mode requests are routed through the consumer-provided bridge.
 */
export interface ITransport {
  request(url: string, init?: RequestInit): Promise<TransportResponse>;
  destroy?(): void;
}

export type TransportMode = 'http' | 'ipc';

export type TransportConfig =
  | { mode: 'http' }
  | {
      mode: 'ipc';
      bridge: IpcBridge;
      /** Access token for API auth — required in IPC mode (cookies don't work). */
      accessToken: string;
      /** Called when a 401 is received. Should return a fresh access token. */
      onTokenRefresh?: () => Promise<string>;
    };

export type { IpcBridge, IpcRequest, IpcResponse };
