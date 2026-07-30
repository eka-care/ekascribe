export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
}

/**
 * Auth tokens. Web → HTTP cookie / refresh flow; electron → `window.authApi.*`
 * (host-managed). Today this lives partly in `src/transport/` (access token +
 * `onTokenRefresh`); Phase 4 brings it fully under this contract.
 */
export interface IAuthTokens {
  getTokens(): Promise<AuthTokens | null>;
  refresh(): Promise<AuthTokens | null>;
  logout(): Promise<void>;
}
