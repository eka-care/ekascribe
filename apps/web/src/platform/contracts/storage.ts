/**
 * A single key-value store (small string values). Synchronous to match `localStorage`
 * and the Zustand `persist` backend.
 */
export interface IKeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
  clear(): void;
}

/**
 * Key-value storage capability, split by scope — the distinction must be preserved:
 * `session` data must NOT survive a browser restart (ongoing session, modal intent,
 * per-tab identity), while `local` data persists.
 *
 * Web → `localStorage` / `sessionStorage`. Electron → the renderer's browser storage,
 * with the `local` scope routed to `window.storageApi` (electron-store) when the host
 * exposes it.
 */
export interface IStorage {
  local: IKeyValueStore;
  session: IKeyValueStore;
}
