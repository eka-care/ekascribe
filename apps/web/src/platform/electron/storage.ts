import type { IKeyValueStore, IStorage } from '../contracts';

type Scope = 'local' | 'session';

/**
 * Electron key-value store for one scope. The Electron renderer has real browser
 * storage, so reads/writes go there today and stay synchronous. For the `local`
 * (persistent) scope, writes are ALSO mirrored to `window.storageApi` when the host
 * exposes it (feature-detected, P4) so DeskDocEka can back it with electron-store; the
 * bridge is absent today, so this degrades to renderer storage with no crash.
 */
export class KeyValueElectronImpl implements IKeyValueStore {
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
    if (this.scope === 'local' && typeof window.storageApi?.set === 'function') {
      void window.storageApi.set(key, value);
    }
  }

  remove(key: string): void {
    this.store?.removeItem(key);
    if (this.scope === 'local' && typeof window.storageApi?.remove === 'function') {
      void window.storageApi.remove(key);
    }
  }

  clear(): void {
    this.store?.clear();
    if (this.scope === 'local' && typeof window.storageApi?.clear === 'function') {
      void window.storageApi.clear();
    }
  }
}

export const storageElectron: IStorage = {
  local: new KeyValueElectronImpl('local'),
  session: new KeyValueElectronImpl('session'),
};
