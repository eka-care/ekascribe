import type { AudioInputDevice, IAudioCapture, MicPermissionState } from '../contracts';

const MIC_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
};

/**
 * Browser audio capture (app-owned surfaces only: permission, device listing, raw stream
 * for the visualizer). The core recording stream is owned by the EkaScribe SDK. All
 * browser globals are touched lazily inside methods, so the module is SSR-safe.
 */
export class AudioCaptureWebImpl implements IAudioCapture {
  async queryPermission(): Promise<MicPermissionState> {
    if (typeof navigator === 'undefined' || !navigator.permissions) return 'unsupported';
    try {
      const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      return status.state as MicPermissionState;
    } catch {
      return 'unsupported';
    }
  }

  async requestPermission(): Promise<MicPermissionState> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
    } catch {
      // Denied or unavailable — reflected by the follow-up query.
    }
    return this.queryPermission();
  }

  async start(options?: { deviceId?: string; system?: boolean }): Promise<MediaStream> {
    const audio: MediaTrackConstraints = options?.deviceId
      ? { deviceId: { exact: options.deviceId }, ...MIC_CONSTRAINTS }
      : { ...MIC_CONSTRAINTS };
    return navigator.mediaDevices.getUserMedia({ audio });
  }

  stop(stream: MediaStream): void {
    stream.getTracks().forEach((t) => t.stop());
  }

  async enumerateInputs(): Promise<AudioInputDevice[]> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return [];
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === 'audioinput')
      .map((d) => ({ deviceId: d.deviceId, label: d.label }));
  }

  onDevicesChanged(callback: () => void): () => void {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) return () => {};
    navigator.mediaDevices.addEventListener('devicechange', callback);
    return () => navigator.mediaDevices.removeEventListener('devicechange', callback);
  }

  onPermissionChange(callback: (state: MicPermissionState) => void): () => void {
    if (typeof navigator === 'undefined' || !navigator.permissions) return () => {};
    let status: PermissionStatus | null = null;
    let cancelled = false;
    navigator.permissions
      .query({ name: 'microphone' as PermissionName })
      .then((s) => {
        if (cancelled) return;
        status = s;
        s.onchange = () => callback(s.state as MicPermissionState);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (status) status.onchange = null;
    };
  }
}

export const audioCaptureWeb: IAudioCapture = new AudioCaptureWebImpl();
