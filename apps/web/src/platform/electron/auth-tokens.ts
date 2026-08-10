import type { AuthTokens, IAuthTokens } from '../contracts';
// Sourced from the sibling capability rather than `@/config/hosts` (which is what
// `GET_EKA_HOST()` returned): hosts.ts now builds its table *from* the platform layer, so
// reaching back into app code from here would make the module graph circular.
import { apiOriginElectron } from './api-origin';

/**
 * Electron auth tokens — delegates to `window.authApi` (exposed by the DeskDocEka preload).
 * All methods feature-detect so an older host with missing methods degrades gracefully (P4).
 *
 * Token shape note: the preload uses `authToken` (not `accessToken`); we map it here so the
 * rest of the app works with the `accessToken` name from the `AuthTokens` contract.
 */
export const authTokensElectron: IAuthTokens = {
  async getTokens(): Promise<AuthTokens | null> {
    // `initialTokens` is synchronously set by the preload from a blocking IPC call before
    // the renderer runs — use it first to avoid an unnecessary async round-trip.
    const initial = window.authApi?.initialTokens;
    if (initial?.authToken) {
      return { accessToken: initial.authToken, refreshToken: initial.refreshToken ?? undefined };
    }
    if (typeof window.authApi?.getTokens === 'function') {
      const t = await window.authApi.getTokens();
      return t?.authToken ? { accessToken: t.authToken, refreshToken: t.refreshToken ?? undefined } : null;
    }
    return null;
  },

  async refresh(): Promise<AuthTokens | null> {
    if (typeof window.authApi?.refreshConnectToken === 'function') {
      const result = await window.authApi.refreshConnectToken(apiOriginElectron.get());
      if (result?.refreshed && result?.authToken) {
        return { accessToken: result.authToken, refreshToken: result.refreshToken ?? undefined };
      }
      return null;
    }
    return null;
  },

  async logout(): Promise<void> {
    if (typeof window.authApi?.logout === 'function') {
      await window.authApi.logout();
    }
  },
};
