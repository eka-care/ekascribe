# scribe-client-sdk — vendored frontend SDKs

Vendored from the published npm dists (the source repos are private):

- `ekascribe-ts-sdk/` — @eka-care/ekascribe-ts-sdk 3.0.44. PATCHED: the host
  table selector honors `globalThis.__SCRIBE_HOSTS__` so on-prem deployments
  point every call at their own backend (set from NEXT_PUBLIC_* envs in
  apps/web/src/config/hosts.ts).
- `med-scribe-alliance-ts-sdk/` — med-scribe-alliance-ts-sdk 2.0.42. Unpatched;
  the app passes `allianceConfig.baseUrl` and a self-hosted worker URL
  (public/msa/worker.bundle.js) instead of jsDelivr.

apps/web depends on these via `file:` paths. When the sources are open-sourced,
replace these dists with the real packages.
