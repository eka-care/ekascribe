export type MicPermissionState = 'granted' | 'denied' | 'prompt' | 'unknown' | 'unsupported';

export interface AudioInputDevice {
  deviceId: string;
  label: string;
}

/**
 * Audio capture. Web → `getUserMedia` (+ `enumerateDevices` / `AudioContext`); electron
 * → delegates system-audio mixing to a native helper via `recordingApi`.
 *
 * Covers only the app-owned surfaces (permission, device listing, raw stream for the
 * visualizer). The core recording stream is owned by the EkaScribe SDK.
 */
export interface IAudioCapture {
  queryPermission(): Promise<MicPermissionState>;
  requestPermission(): Promise<MicPermissionState>;
  /** Start capture. `system: true` requests mixed system + mic audio. */
  start(options?: { deviceId?: string; system?: boolean }): Promise<MediaStream>;
  stop(stream: MediaStream): void;
  /** List audio input devices (labels populated only after permission is granted). */
  enumerateInputs(): Promise<AudioInputDevice[]>;
  /** Subscribe to device add/remove. Returns an unsubscribe fn. */
  onDevicesChanged(callback: () => void): () => void;
  /** Subscribe to mic permission-state changes. Returns an unsubscribe fn. */
  onPermissionChange(callback: (state: MicPermissionState) => void): () => void;
  /** Install mixed mic+system audio capture for a session (desktop-only). */
  installSessionMixing?(deviceId?: string): Promise<(() => void) | null>;
  /** Teardown any active session mixing. */
  teardownSessionMixing?(): void;
}
