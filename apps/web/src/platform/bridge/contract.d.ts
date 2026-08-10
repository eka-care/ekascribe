/**
 * The single typed description of every `window.*Api` bridge the Electron host exposes
 * via `contextBridge`. THIS IS THE ONLY ARTIFACT SHARED ACROSS REPOS (ekascribe-web ⇄
 * DeskDocEka) — DeskDocEka's `preload.ts` type-checks against this same file.
 *
 * GOVERNANCE (P3 / AP-6): additive only. Every member is OPTIONAL so a newer web build
 * loaded by an older host degrades gracefully (the electron adapter feature-detects the
 * method and reports the descriptor `false`). Never change or remove an existing
 * signature — deprecate instead. Bump `version.ts` when you add members.
 *
 * No bridges are wired in the code yet; these shapes are the agreed surface the desktop
 * team fills in. Refine signatures alongside each capability migration.
 */

interface StorageApi {
  get?(key: string): Promise<string | null>;
  set?(key: string, value: string): Promise<void>;
  remove?(key: string): Promise<void>;
  clear?(): Promise<void>;
}

interface BlobApi {
  put?(txnId: string, fileName: string, data: ArrayBuffer): Promise<void>;
  get?(txnId: string, fileName: string): Promise<ArrayBuffer | null>;
  list?(txnId: string): Promise<string[]>;
  delete?(txnId: string, fileName?: string): Promise<void>;
}

interface FileApi {
  openFile?(options?: {
    type?: 'document' | 'audio';
    accept?: string;
    multiple?: boolean;
  }): Promise<Array<{
    name: string;
    type: string;
    size: number;
    data: Uint8Array;
  }> | null>;
}

interface ClipboardApi {
  write?(payload: { html?: string; text: string }): Promise<void>;
}

interface PrintApi {
  htmlToPdf?(html: string): Promise<ArrayBuffer>;
  printHtml?(html: string): Promise<void>;
}

interface NotificationApi {
  show?(opts: { title: string; body: string; silent?: boolean }): Promise<void>;
  onClick?(callback: (data: Record<string, unknown> | null) => void): () => void;
}

interface SystemApi {
  openExternal?(url: string): Promise<void>;
  getDotnetRuntimeStatus?(options?: {
    refresh?: boolean;
  }): Promise<{ host: string; version?: string }>;
  onOpenUserDefaults?(callback: () => void): () => void;
  onLogout?(callback: () => void): () => void;
}

interface AuthApi {
  initialTokens?: { authToken: string | null; refreshToken: string | null };
  getTokens?(): Promise<{ authToken: string | null; refreshToken: string | null }>;
  refreshConnectToken?(ekaHost: string): Promise<{
    refreshed: boolean;
    isNetworkError: boolean;
    authToken: string | null;
    refreshToken: string | null;
  }>;
  logout?(): Promise<void>;
  startOidcLogin?(): Promise<unknown>;
  persistTokens?(accessToken: string, refreshToken: string): Promise<void>;
}

interface RecordingApi {
  startSystemAudio?(): Promise<{ granted: boolean; error?: string }>;
  stopSystemAudio?(): Promise<void>;
}

interface ScribeApi {
  // subscriptions — host → renderer (actual preload method names)
  onStartRequest?(handler: () => void): () => void;
  onPauseRequest?(handler: () => void): () => void;
  onResumeRequest?(handler: () => void): () => void;
  onStopRequest?(handler: () => void): () => void;
  onSetupScribeApp?(handler: (payload: unknown) => void): () => void;
  onGetStatusRequest?(
    handler: () => { processingStatus: string; sessionId: string | null }
  ): () => void;
  onViewTransaction?(handler: (transactionId: string) => void): () => void;
  onStartWithAppointmentRequest?(handler: (data: unknown) => void): () => void;
  // notifications — renderer → host
  updateStatus?(processingStatus: string, sessionId: string | null): void;
  notifyProcessingCompleted?(transactionId: string, status: string): void;
  notifySessionDiscarded?(): void;
  notifyError?(errorCode: string, errorMessage: string): void;
  notifyRendererReady?(): void;
  sendAppointments?(data: unknown): void;
  // kept for additive-only governance — do not remove
  onStart?(handler: () => void): void;
  onStop?(handler: () => void): void;
  onSetup?(handler: (payload: unknown) => void): void;
  reportStatus?(status: string): void;
}

interface DesktopSettingsApi {
  onUpdateAvailable?(callback: (info: { version: string }) => void): () => void;
  onUpdateProgress?(callback: (info: { percent: number }) => void): () => void;
  onUpdateReady?(callback: () => void): () => void;
  relaunchAndInstall?(): Promise<void>;
  // v4 additions — additive only
  getNotificationPreferences?(): Promise<{
    joinVideoConferencingAndStartTranscribing: boolean;
    meetingIsBeingRecorded: boolean;
    meetingIsSummarized: boolean;
  }>;
  updateNotificationPreferences?(
    prefs: Partial<{
      joinVideoConferencingAndStartTranscribing: boolean;
      meetingIsBeingRecorded: boolean;
      meetingIsSummarized: boolean;
    }>
  ): Promise<{
    joinVideoConferencingAndStartTranscribing: boolean;
    meetingIsBeingRecorded: boolean;
    meetingIsSummarized: boolean;
  }>;
  getShortcutPreferences?(): Promise<{ enabled: boolean; shortcut: string }>;
  updateShortcutPreferences?(
    prefs: Partial<{ enabled: boolean; shortcut: string }>
  ): Promise<{ enabled: boolean; shortcut: string }>;
}

interface LogApi {
  log?(message: string): Promise<void>;
}

interface BridgeMeta {
  version: number;
}

declare global {
  interface Window {
    __bridge?: BridgeMeta;
    storageApi?: StorageApi;
    blobApi?: BlobApi;
    fileApi?: FileApi;
    clipboardApi?: ClipboardApi;
    printApi?: PrintApi;
    notificationApi?: NotificationApi;
    systemApi?: SystemApi;
    authApi?: AuthApi;
    recordingApi?: RecordingApi;
    scribeApi?: ScribeApi;
    desktopSettingsApi?: DesktopSettingsApi;
    logApi?: LogApi;
  }
}

export {};
