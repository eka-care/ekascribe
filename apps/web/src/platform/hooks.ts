'use client';

import type {
  CapabilitySet,
  HostId,
  IAppUpdates,
  IAudioCapture,
  IAuthTokens,
  IBlobStore,
  IClipboard,
  IDesktopSettings,
  IHostBridge,
  IFilePicker,
  INotifier,
  IPrinter,
  IStorage,
  ISystem,
  IWhatsApp,
  PlatformImplementations,
} from './contracts';
import { getFlavour } from './registry';
import { usePlatformContext } from './provider';

/** The full build-selected capability map. */
export function usePlatform(): PlatformImplementations {
  return usePlatformContext().platform;
}

/** Key-value storage (`.local` / `.session`). Always present in every family. */
export function useStorage(): IStorage {
  const storage = usePlatformContext().platform.storage;
  if (!storage) throw new Error('Storage capability is not registered');
  return storage;
}

/** Large-object blob store (audio chunks). Always present in every family. */
export function useBlobStore(): IBlobStore {
  const blob = usePlatformContext().platform.blobStore;
  if (!blob) throw new Error('BlobStore capability is not registered');
  return blob;
}

/** File picker. Always present in every family. */
export function useFilePicker(): IFilePicker {
  const fp = usePlatformContext().platform.filePicker;
  if (!fp) throw new Error('FilePicker capability is not registered');
  return fp;
}

/** Rich (HTML + plain-text) clipboard. `undefined` if the family doesn't register it. */
export function useClipboard(): IClipboard | undefined {
  return usePlatformContext().platform.clipboard;
}

/** Open external URLs / shell integration. `undefined` if not registered. */
export function useSystem(): ISystem | undefined {
  return usePlatformContext().platform.system;
}

/** Document printing (web → print dialog; electron → native). `undefined` if not registered. */
export function usePrinter(): IPrinter | undefined {
  return usePlatformContext().platform.printer;
}

/** OS notifications. `undefined` if the family doesn't register it. */
export function useNotifier(): INotifier | undefined {
  return usePlatformContext().platform.notifier;
}

/** WhatsApp linked-device messaging. `undefined` unless a host bridge registers it (desktop). */
export function useWhatsApp(): IWhatsApp | undefined {
  return usePlatformContext().platform.whatsapp;
}

/** Audio capture (mic permission, device listing, visualizer stream). Always registered. */
export function useAudioCapture(): IAudioCapture | undefined {
  return usePlatformContext().platform.audioCapture;
}

/** Host command bridge (host drives recording / receives status). Always registered. */
export function useHostBridge(): IHostBridge | undefined {
  return usePlatformContext().platform.hostBridge;
}

/** Auth tokens (web cookie refresh; electron host-managed). Always registered. */
export function useAuthTokens(): IAuthTokens | undefined {
  return usePlatformContext().platform.authTokens;
}

/**
 * Capability descriptors for UI gating:
 * `useCapabilities().has('native-file-dialog')` — never `isElectronApp` (AP-4 / §11).
 */
export function useCapabilities(): CapabilitySet {
  return usePlatformContext().capabilities;
}

/**
 * Build-time host identity (`'web'` | `'desktop'`). For pure show/hide only — prefer
 * `<DesktopOnly>` / `<WebOnly>`. Behavioural branches use `useCapabilities()` (AP-4).
 */
export function useHost(): HostId {
  return usePlatformContext().host;
}

/** Build-time app flavour string (`'ekascribe-web'` | `'ekascribe-desktop-mac'` | `'ekascribe-desktop-windows'`). */
export function useFlavour(): string {
  return getFlavour();
}

/** Desktop app-update events (check / download / install). `undefined` on web. */
export function useAppUpdates(): IAppUpdates | undefined {
  return usePlatformContext().platform.appUpdates;
}

/** Desktop widget settings (shortcuts, WA auto-send, overlay visibility). `undefined` on web. */
export function useDesktopSettings(): IDesktopSettings | undefined {
  return usePlatformContext().platform.desktopSettings;
}

// Per-capability hooks (useStorage, useFilePicker, …) are added here as each capability
// is migrated — see `.claude/plans/platform-migration-tracker.md`.
