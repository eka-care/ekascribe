import type { IApiOrigin } from '../contracts';

/**
 * Electron API origin — the host's main-process HTTP proxy.
 *
 * `window.apiProxyApi.origin` is a plain string rather than a method because the host
 * reads it over synchronous IPC in its preload: `config/hosts.ts` needs the value while
 * it is still evaluating, so there is no point at which an async call could resolve.
 *
 * Feature-detected (P4): an older host without the bridge falls back to same-origin,
 * which is the pre-proxy behaviour, so only the proxy indirection is lost.
 */
export class ApiOriginElectronImpl implements IApiOrigin {
  get(): string {
    // hosts.ts is imported during SSR too (the desktop build runs Next standalone).
    if (typeof window === 'undefined') return '';

    const origin = window.apiProxyApi?.origin;
    return typeof origin === 'string' && origin.length > 0 ? origin : '';
  }
}

export const apiOriginElectron: IApiOrigin = new ApiOriginElectronImpl();
