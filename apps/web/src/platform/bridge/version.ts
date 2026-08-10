/**
 * Bridge contract version handshake (see §12 — submodule skew). The host stamps
 * `window.__bridge = { version }`; combined with per-method feature detection in the
 * electron adapters, a newer web build against an older host degrades only the affected
 * capability rather than crashing.
 *
 * Bump `BRIDGE_CONTRACT_VERSION` whenever `contract.d.ts` gains members.
 */
export const BRIDGE_CONTRACT_VERSION = 6;

/** Oldest host bridge version this web build can still operate against. */
export const MIN_SUPPORTED = 1;
