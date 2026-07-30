import type { ISystem, RuntimeStatus } from '../contracts';

/**
 * Web system / shell. External links open in a new tab; `window` is touched only inside
 * methods so the module is SSR-safe.
 */
export class SystemWebImpl implements ISystem {
  async openExternal(url: string): Promise<void> {
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async getRuntimeStatus(): Promise<RuntimeStatus> {
    return { host: 'web' };
  }
}

export const systemWeb: ISystem = new SystemWebImpl();
