import type { HostId, PlatformImplementations } from '../contracts';
import { appUpdatesElectron } from './app-updates';
import { desktopSettingsElectron } from './desktop-settings';
import { audioCaptureElectron } from './audio-capture';
import { authTokensElectron } from './auth-tokens';
import { blobStoreElectron } from './blob-store';
import { clipboardElectron } from './clipboard';
import { hostBridgeElectron } from './host-bridge';
import { networkElectron } from './network';
import { filePickerElectron } from './file-picker';
import { notifierElectron } from './notifier';
import { printerElectron } from './printer';
import { storageElectron } from './storage';
import { systemElectron } from './system';

/**
 * Electron implementation family — thin adapters that call `window.*Api` (typed by
 * `bridge/contract.d.ts`) and FEATURE-DETECT each method, degrading gracefully when the
 * host hasn't shipped it (P4 / version skew). One file per capability lives alongside
 * this index (e.g. `electron/storage.ts`); register each here (alphabetical, one line).
 *
 * Resolved at build time via the `@platform-impl` alias (NEXT_PUBLIC_APP_SOURCE=electron-*).
 */
export const host: HostId = 'desktop';

const _appSource = process.env.NEXT_PUBLIC_APP_SOURCE ?? 'electron';
export const flavour: string =
  _appSource === 'electron-windows' ? 'ekascribe-desktop-windows' : 'ekascribe-desktop-mac';

export const implementations: PlatformImplementations = {
  appUpdates: appUpdatesElectron,
  desktopSettings: desktopSettingsElectron,
  audioCapture: audioCaptureElectron,
  authTokens: authTokensElectron,
  blobStore: blobStoreElectron,
  clipboard: clipboardElectron,
  hostBridge: hostBridgeElectron,
  network: networkElectron,
  filePicker: filePickerElectron,
  notifier: notifierElectron,
  printer: printerElectron,
  storage: storageElectron,
  system: systemElectron,
};
