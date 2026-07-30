import type { AuthTokens, IAuthTokens } from '../contracts';

/**
 * Web auth tokens — the web app authenticates via HTTP-only cookies, so no token is exposed
 * to JS (`getTokens` → null). `refresh` delegates to the existing cookie-based refresh flow.
 * Light wrapper: it formalizes the seam without changing the proven auth path.
 *
 * `@/fetch-client` is imported lazily inside `refresh` to avoid a module-load cycle
 * (`fetch-client` → logout util → `@/platform` → this family).
 */
export const authTokensWeb: IAuthTokens = {
  async getTokens(): Promise<AuthTokens | null> {
    return null;
  },
  async refresh(): Promise<AuthTokens | null> {
    const { refreshToken } = await import('@/fetch-client');
    await refreshToken();
    return null;
  },

  async logout(): Promise<void> {
    // Web logout is handled centrally by user-auth-logout-utility-methods
  },
};
