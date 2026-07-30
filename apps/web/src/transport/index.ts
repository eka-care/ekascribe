import { HttpTransport } from './http-transport';
import { IpcTransport } from './ipc-transport';
import type { ITransport, TransportConfig } from './types';

let transport: ITransport | null = null;
let currentConfig: TransportConfig = { mode: 'http' };

/**
 * Initialize the transport layer.
 * Call this before initializing the SDK.
 */
export function initTransport(config: TransportConfig) {
  if (transport?.destroy) transport.destroy();

  currentConfig = config;

  if (config.mode === 'ipc') {
    transport = new IpcTransport(config.bridge);
  } else {
    transport = new HttpTransport();
  }
}

/**
 * Install an explicit transport instance (e.g. the desktop host transport that routes through
 * `window.networkApi`). Used by the desktop auth bootstrap so `getTransport()` resolves to the
 * host transport without this module needing to know about `window.*`.
 */
export function setTransport(next: ITransport) {
  if (transport?.destroy) transport.destroy();
  transport = next;
}

/**
 * Get the current transport instance.
 * Defaults to HTTP if `initTransport` was never called.
 */
export function getTransport(): ITransport {
  if (!transport) {
    transport = new HttpTransport();
  }
  return transport;
}

/** Returns the current transport mode. */
export function getTransportMode(): 'http' | 'ipc' {
  return currentConfig.mode;
}

/**
 * Get the current access token (IPC mode only).
 * In HTTP mode returns null — auth is handled via cookies.
 */
export function getAccessToken(): string | null {
  return currentConfig.mode === 'ipc' ? currentConfig.accessToken : null;
}

/**
 * Update the stored access token (e.g. after a refresh).
 * Only applicable in IPC mode.
 */
export function setAccessToken(token: string) {
  if (currentConfig.mode === 'ipc') {
    currentConfig.accessToken = token;
  }
}

/**
 * Refresh the access token via the host-provided callback (IPC mode).
 * Returns the new token, or null if no callback / HTTP mode.
 */
export async function refreshAccessToken(): Promise<string | null> {
  if (currentConfig.mode !== 'ipc' || !currentConfig.onTokenRefresh) return null;

  const newToken = await currentConfig.onTokenRefresh();
  currentConfig.accessToken = newToken;
  return newToken;
}

export type { ITransport, TransportConfig, TransportResponse, IpcBridge } from './types';
