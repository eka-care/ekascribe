import type { ITransport } from './network';
import type { IApiOrigin } from './api-origin';
import type { IAudioCapture } from './audio-capture';
import type { IAppUpdates } from './app-updates';
import type { IAuthTokens } from './auth-tokens';
import type { IBlobStore } from './blob-store';
import type { IClipboard } from './clipboard';
import type { IDesktopSettings } from './desktop-settings';
import type { IFilePicker } from './file-picker';
import type { IHostBridge } from './host-bridge';
import type { IStorage } from './storage';
import type { INotifier } from './notifier';
import type { IPrinter } from './printer';
import type { ISystem } from './system';

/**
 * The full capability map. A platform implementation family provides a subset of these;
 * the registry derives the active descriptor set from which keys are present.
 *
 * One key per capability, named in camelCase. The corresponding descriptor id(s) live in
 * `capabilities.ts` and are wired in `registry.ts`.
 */
export interface Platform {
  apiOrigin: IApiOrigin;
  appUpdates: IAppUpdates;
  audioCapture: IAudioCapture;
  authTokens: IAuthTokens;
  blobStore: IBlobStore;
  clipboard: IClipboard;
  desktopSettings: IDesktopSettings;
  filePicker: IFilePicker;
  hostBridge: IHostBridge;
  network: ITransport;
  notifier: INotifier;
  printer: IPrinter;
  storage: IStorage;
  system: ISystem;
}

/**
 * What a family actually ships. Capabilities are migrated incrementally (see the
 * tracker), so during migration only a subset of keys is present.
 */
export type PlatformImplementations = Partial<Platform>;

export type { CapabilityId, CapabilitySet } from './capabilities';
export type { HostId } from './host';
export type { IKeyValueStore, IStorage } from './storage';
export type { IBlobStore } from './blob-store';
export type { IFilePicker, FilePickerOptions } from './file-picker';
export type { IAudioCapture, MicPermissionState, AudioInputDevice } from './audio-capture';
export type { ITransport, TransportResponse } from './network';
export type { IApiOrigin } from './api-origin';
export type { IClipboard } from './clipboard';
export type { IPrinter } from './printer';
export type { INotifier, NotificationOptions } from './notifier';
export type { ISystem, RuntimeStatus } from './system';
export type { IAuthTokens, AuthTokens } from './auth-tokens';
export type { IHostBridge, ScribeRecordingStatus } from './host-bridge';
export type { IAppUpdates } from './app-updates';
export type {
  IDesktopSettings,
  NotificationPreferences,
  ShortcutPreferences,
} from './desktop-settings';
