/**
 * On-prem host configuration (plan Phase 5).
 *
 * ONE knob for the common case: NEXT_PUBLIC_API_HOST (your ekascribe-oss API,
 * e.g. http://localhost:8000) — every backend URL derives from it. Individual
 * NEXT_PUBLIC_*_HOST overrides exist for split deployments / hybrid eka-cloud.
 *
 * This module also publishes the host table to globalThis.__SCRIBE_HOSTS__,
 * which the vendored @eka-care/ekascribe-ts-sdk dist reads (see
 * packages/scribe-client-sdk/README.md). Import this module before any SDK use
 * (done in the root layout / sdk-provider).
 */

const API_HOST = (
  process.env.NEXT_PUBLIC_API_HOST || 'http://localhost:8000'
).replace(/\/$/, '');

const WEB_HOST = (
  process.env.NEXT_PUBLIC_WEB_HOST || 'http://localhost:3000'
).replace(/\/$/, '');

export const HOSTS = {
  /** ekascribe-oss API base */
  API_HOST,
  /** this web app's own public URL (used in login redirects) */
  WEB_HOST,

  EKA_HOST: process.env.NEXT_PUBLIC_EKA_HOST || API_HOST,
  EKA_V2RX_HOST_V2: process.env.NEXT_PUBLIC_V2RX_HOST_V2 || `${API_HOST}/voice/api/v2`,
  EKA_V2RX_HOST_V3: process.env.NEXT_PUBLIC_V2RX_HOST_V3 || `${API_HOST}/voice/api/v3`,
  ALLIANCE_BASE_URL: process.env.NEXT_PUBLIC_ALLIANCE_BASE_URL || `${API_HOST}/voice/v1`,

  // eka platform services — only used by feature-flagged (off) features;
  // point them at the API host so nothing calls eka cloud by default.
  AORTAGO_HOST: process.env.NEXT_PUBLIC_AORTAGO_HOST || API_HOST,
  COG_HOST: process.env.NEXT_PUBLIC_COG_HOST || API_HOST,
  HUB_HOST: process.env.NEXT_PUBLIC_HUB_HOST || API_HOST,
  PARCHI_HOST: process.env.NEXT_PUBLIC_PARCHI_HOST || API_HOST,
  COOK_HOST: process.env.NEXT_PUBLIC_COOK_HOST || `${API_HOST}/api/v1`,

  /** login page; defaults to the app's own /login (dev-token mode needs none) */
  LOGIN_URL:
    process.env.NEXT_PUBLIC_LOGIN_URL ||
    `${WEB_HOST}/auth/login?audience=scribe-web&next=${encodeURIComponent(WEB_HOST)}`,
  SWITCH_WORKSPACE_URL:
    process.env.NEXT_PUBLIC_SWITCH_WORKSPACE_URL ||
    `${WEB_HOST}/auth/switch?next=${encodeURIComponent(WEB_HOST)}&audience=scribe-web`,

  /** self-hosted alliance SDK SharedWorker (plan A4 — no jsDelivr at runtime) */
  MSA_WORKER_URL: process.env.NEXT_PUBLIC_MSA_WORKER_URL || '/msa/worker.bundle.js',
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
