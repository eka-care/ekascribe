/**
 * Host configuration — the API base comes from the `apiOrigin` capability.
 *
 * On web that resolves to '' : the static bundle is served by the FastAPI api itself, so
 * every backend URL is relative. No NEXT_PUBLIC_*_HOST env vars, no baked hostnames — the
 * bundle works unchanged on any domain. In dev, `next dev` proxies the API paths to :8000
 * (see rewrites() in next.config.ts).
 *
 * On desktop it resolves to the Electron host's main-process HTTP proxy, so every backend
 * call leaves through the main process, which attaches credentials and refreshes expired
 * tokens. Read synchronously — the table below is built as this module is evaluated.
 *
 * This module also publishes the host table to globalThis.__SCRIBE_HOSTS__,
 * which the vendored @eka-care/ekascribe-ts-sdk dist reads (see
 * packages/scribe-client-sdk/README.md). Import this module before any SDK use
 * (done in the root layout / sdk-provider).
 */
import { getApiOrigin } from '@/platform';

const API_HOST = getApiOrigin();
const WEB_HOST = '';

export const HOSTS = {
  /** ekascribe API base — same origin as the app */
  API_HOST,
  /** this web app's own public URL (used in login redirects) — same origin */
  WEB_HOST,

  EKA_HOST: API_HOST,
  EKA_V2RX_HOST_V2: `${API_HOST}/voice/api/v2`,
  EKA_V2RX_HOST_V3: `${API_HOST}/voice/api/v3`,
  ALLIANCE_BASE_URL: `${API_HOST}/voice/v1`,

  PARCHI_HOST: API_HOST,
  COOK_HOST: `${API_HOST}/api/v1`,

  /** login page; defaults to the app's own /login (dev-token mode needs none) */
  LOGIN_URL: `${WEB_HOST}/auth/login?audience=scribe-web`,
  SWITCH_WORKSPACE_URL: `${WEB_HOST}/auth/switch?audience=scribe-web`,

  /** self-hosted alliance SDK SharedWorker (plan A4 — no jsDelivr at runtime) */
  MSA_WORKER_URL: '/msa/worker.bundle.js',
};

/** Host table consumed by the vendored ekascribe-ts-sdk dist. */
export function publishSdkHosts(): void {
  if (typeof globalThis === 'undefined') return;
  (globalThis as Record<string, unknown>).__SCRIBE_HOSTS__ = {
    voiceV1: `${HOSTS.EKA_HOST}/voice/api/v1`,
    voiceV2: HOSTS.EKA_V2RX_HOST_V2,
    voiceV3: HOSTS.EKA_V2RX_HOST_V3,
    cookV1: HOSTS.COOK_HOST,
    ekaHost: HOSTS.EKA_HOST,
    parchiHost: HOSTS.PARCHI_HOST,
  };
}

publishSdkHosts();
