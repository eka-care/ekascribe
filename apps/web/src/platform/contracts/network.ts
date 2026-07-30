/**
 * Network is the reference capability — it already exists and works. Rather than
 * redefining it, re-export the proven `ITransport` contract from `src/transport/`.
 * Phase 4 folds the transport's runtime `initTransport({ mode })` selection under the
 * build-time registry (see the migration tracker).
 */
export type { ITransport, TransportResponse } from '../../transport/types';
