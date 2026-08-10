/**
 * Capability descriptors — kebab-case ids used to gate UI on *what the platform
 * can do*, never on *which platform it is* (see AP-4 / §11 of the architecture doc).
 *
 * The registry computes the active set from the implementations actually present in
 * the build-selected family. UI asks `useCapabilities().has('native-file-dialog')`.
 */
export type CapabilityId =
  | 'persistent-kv' // small key-value storage
  | 'large-blob-store' // large object store (audio chunks)
  | 'native-file-dialog' // OS file picker
  | 'mic-permission-prompt' // microphone permission flow
  | 'system-audio-capture' // mixed system + mic capture
  | 'ipc-network' // requests routed through host IPC (already done via transport)
  | 'host-api-proxy' // backend calls routed through a host-run HTTP proxy
  | 'rich-clipboard' // HTML + plain-text clipboard
  | 'native-pdf-export' // native HTML→PDF export
  | 'os-notifications' // OS-level notifications
  | 'shell-open' // open external URLs / shell integration
  | 'host-managed-auth' // tokens supplied/refreshed by the host
  | 'host-recording-control' // host drives scribe start/stop/status
  | 'app-updates' // desktop app auto-updater (check, download, install)
  | 'desktop-settings'; // desktop widget settings (shortcuts, WA auto-send, overlay visibility)

/** A read-only view of the descriptors active in the current build/runtime. */
export interface CapabilitySet {
  has(id: CapabilityId): boolean;
  list(): CapabilityId[];
}
