import type { IKeyValueStore, IStorage } from '../contracts';

type Scope = 'local' | 'session';

/**
 * Browser key-value store for one scope. Storage is accessed lazily and guarded so the
 * module is safe to import during SSR (no `window` at load or on the server).
 */
export class KeyValueWebImpl implements IKeyValueStore {
  constructor(private readonly scope: Scope) {}

  private get store(): Storage | null {
    if (typeof window === 'undefined') return null;
    return this.scope === 'local' ? window.localStorage : window.sessionStorage;
  }

  get(key: string): string | null {
    return this.store?.getItem(key) ?? null;
  }

  set(key: string, value: string): void {
    this.store?.setItem(key, value);
  }

  remove(key: string): void {
    this.store?.removeItem(key);
  }

  clear(): void {
    this.store?.clear();
  }
}

export const storageWeb: IStorage = {
  local: new KeyValueWebImpl('local'),
  session: new KeyValueWebImpl('session'),
};
