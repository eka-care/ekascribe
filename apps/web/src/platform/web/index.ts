import type { HostId, PlatformImplementations } from '../contracts';
import { audioCaptureWeb } from './audio-capture';
import { authTokensWeb } from './auth-tokens';
import { blobStoreWeb } from './blob-store';
import { clipboardWeb } from './clipboard';
import { hostBridgeWeb } from './host-bridge';
import { networkWeb } from './network';
import { filePickerWeb } from './file-picker';
import { notifierWeb } from './notifier';
import { printerWeb } from './printer';
import { storageWeb } from './storage';
import { systemWeb } from './system';

/**
 * Web implementation family (browser APIs: localStorage, IndexedDB, getUserMedia,
 * fetch …). One file per capability lives alongside this index (e.g. `web/storage.ts`);
 * register each here as it is migrated (alphabetical, one line).
 *
 * Resolved at build time via the `@platform-impl` alias (NEXT_PUBLIC_APP_SOURCE=web).
 */
export const host: HostId = 'web';
export const flavour: string = 'ekascribe-web';

export const implementations: PlatformImplementations = {
  audioCapture: audioCaptureWeb,
  authTokens: authTokensWeb,
  blobStore: blobStoreWeb,
  clipboard: clipboardWeb,
  hostBridge: hostBridgeWeb,
  network: networkWeb,
  filePicker: filePickerWeb,
  notifier: notifierWeb,
  printer: printerWeb,
  storage: storageWeb,
  system: systemWeb,
};
