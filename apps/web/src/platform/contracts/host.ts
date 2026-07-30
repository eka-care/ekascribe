/**
 * Host identity — *what the platform is*, decided at build time by the selected
 * implementation family (`@platform-impl`). Used ONLY by the platform-visibility
 * primitives (`<DesktopOnly>` / `<WebOnly>`) for pure show/hide. Everything behavioural
 * gates on capability descriptors (`CapabilityId`), never on the host.
 */
export type HostId = 'web' | 'desktop';
