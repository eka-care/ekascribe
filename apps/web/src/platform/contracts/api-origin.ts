/**
 * API origin — the base every backend URL is built against.
 *
 * On web the bundle is served by the API itself, so the base is same-origin (''). On
 * desktop there is no such co-location: the host runs an HTTP proxy in its main process
 * and hands the renderer that proxy's origin, making the main process the single network
 * egress (it attaches credentials and refreshes expired tokens there).
 *
 * Resolved synchronously — the host table is built while `config/hosts.ts` is evaluated,
 * before any async call could settle.
 */
export interface IApiOrigin {
  /** Origin to prefix backend paths with. `''` means same-origin as the page. */
  get(): string;
}
