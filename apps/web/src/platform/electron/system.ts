import type { ISystem, RuntimeStatus } from '../contracts';

/**
 * Electron system / shell adapter. External links route through the host
 * (`window.systemApi.openExternal`) so they open in the OS browser, not a desktop window;
 * feature-detected (P4) with a `window.open` fallback when the bridge is absent.
 */
export class SystemElectronImpl implements ISystem {
  async openExternal(url: string): Promise<void> {
    if (typeof window.systemApi?.openExternal === 'function') {
      await window.systemApi.openExternal(url);
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async getRuntimeStatus(): Promise<RuntimeStatus> {
    if (typeof window.systemApi?.getDotnetRuntimeStatus === 'function') {
      return window.systemApi.getDotnetRuntimeStatus();
    }
    return { host: 'electron' };
  }

  onOpenUserDefaults(callback: () => void): () => void {
    if (typeof window.systemApi?.onOpenUserDefaults === 'function') {
      return window.systemApi.onOpenUserDefaults(callback);
    }
    return () => {};
  }

  onLogout(callback: () => void): () => void {
    if (typeof window.systemApi?.onLogout === 'function') {
      return window.systemApi.onLogout(callback);
    }
    return () => {};
  }
}

export const systemElectron: ISystem = new SystemElectronImpl();
