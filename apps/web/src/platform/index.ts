/**
 * Platform Capability Layer — public surface.
 *
 * Application code imports from here (or the React hooks) and depends on capabilities,
 * never on `window.*Api` or platform names (P1). Architecture & how-to:
 * `.claude/docs/architecture/platform-capability-layer.md` and `implementation-guide.md`.
 */
export {
  getPlatform,
  getActiveCapabilities,
  getApiOrigin,
  getStorage,
  getHost,
  getFlavour,
  getNetwork,
  getAuthTokens,
  getBlobStore
} from './registry';
export { PlatformProvider } from './provider';
export {
  usePlatform,
  useCapabilities,
  useStorage,
  useBlobStore,
  useClipboard,
  useFilePicker,
  useSystem,
  usePrinter,
  useNotifier,
  useAudioCapture,
  useHostBridge,
  useAuthTokens,
  useHost,
  useFlavour,
  useApiOrigin,
  useAppUpdates,
  useDesktopSettings,
} from './hooks';
export { DesktopOnly } from './components/desktop-only';
export { WebOnly } from './components/web-only';
export { Capability } from './components/capability';
export { BRIDGE_CONTRACT_VERSION, MIN_SUPPORTED } from './bridge/version';
export type * from './contracts';
