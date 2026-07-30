import type { IAudioCapture } from '../contracts';
import { AudioCaptureWebImpl } from '../web/audio-capture';

type MediaDevicesWithMutableGetUserMedia = MediaDevices & {
  getUserMedia: (constraints?: MediaStreamConstraints) => Promise<MediaStream>;
};

/**
 * Electron audio capture. The renderer is a browser, so permission/device/stream behaviour
 * is inherited from the web impl; only system-audio mixing is host-specific and routed to
 * `window.recordingApi` (feature-detected, P4) — absent bridge degrades to plain mic capture.
 */
export class AudioCaptureElectronImpl extends AudioCaptureWebImpl {
  private _mixingCleanup: (() => void) | null = null;

  async start(options?: { deviceId?: string; system?: boolean }): Promise<MediaStream> {
    if (options?.system && typeof window.recordingApi?.startSystemAudio === 'function') {
      await window.recordingApi.startSystemAudio();
    }
    return super.start(options);
  }

  stop(stream: MediaStream): void {
    if (typeof window.recordingApi?.stopSystemAudio === 'function') {
      void window.recordingApi.stopSystemAudio();
    }
    super.stop(stream);
  }

  async installSessionMixing(deviceId?: string): Promise<(() => void) | null> {
    this.teardownSessionMixing();

    if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return null;
    }

    const mediaDevices = navigator.mediaDevices as MediaDevicesWithMutableGetUserMedia;
    const originalGetUserMedia = mediaDevices.getUserMedia.bind(mediaDevices);

    let mixedStream: MediaStream | null = null;
    let micStream: MediaStream | null = null;
    let systemStream: MediaStream | null = null;
    let audioContext: AudioContext | null = null;
    let isDisposed = false;
    const clonedStreams: MediaStream[] = [];

    const createMixedStream = async (
      constraints?: MediaStreamConstraints
    ): Promise<MediaStream> => {
      if (mixedStream) return mixedStream;

      const audioConstraints: MediaTrackConstraints | boolean = deviceId
        ? { deviceId: { exact: deviceId } }
        : typeof constraints === 'object' && constraints?.audio !== undefined
          ? constraints.audio
          : true;

      micStream = await originalGetUserMedia({ audio: audioConstraints, video: false });

      systemStream = await navigator.mediaDevices.getDisplayMedia({
        video: false,
        audio: true,
      });

      const systemAudioTrack = systemStream.getAudioTracks()[0];
      if (!systemAudioTrack) throw new Error('System audio capture was not granted');

      audioContext = new AudioContext();
      const destination = audioContext.createMediaStreamDestination();

      const micSource = audioContext.createMediaStreamSource(micStream);
      const systemSource = audioContext.createMediaStreamSource(
        new MediaStream([systemAudioTrack])
      );
      const micGain = audioContext.createGain();
      const systemGain = audioContext.createGain();

      micGain.gain.value = 1.0;
      systemGain.gain.value = 0.9;

      micSource.connect(micGain).connect(destination);
      systemSource.connect(systemGain).connect(destination);

      mixedStream = destination.stream;
      return mixedStream;
    };

    mediaDevices.getUserMedia = async (constraints?: MediaStreamConstraints) => {
      const wantsAudio =
        typeof constraints !== 'object' || constraints?.audio === undefined
          ? true
          : Boolean(constraints.audio);
      const wantsVideo = typeof constraints === 'object' && Boolean(constraints?.video);

      if (!wantsAudio || wantsVideo) return originalGetUserMedia(constraints);

      const mixed = await createMixedStream(constraints);
      const cloned = mixed.clone();
      clonedStreams.push(cloned);
      return cloned;
    };

    const cleanup = () => {
      if (isDisposed) return;
      isDisposed = true;

      mediaDevices.getUserMedia = originalGetUserMedia;

      for (const cloned of clonedStreams) {
        cloned.getTracks().forEach((track) => track.stop());
      }
      clonedStreams.length = 0;

      mixedStream?.getTracks().forEach((track) => track.stop());
      micStream?.getTracks().forEach((track) => track.stop());
      systemStream?.getTracks().forEach((track) => track.stop());

      void audioContext?.close();
    };

    this._mixingCleanup = cleanup;
    return cleanup;
  }

  teardownSessionMixing(): void {
    this._mixingCleanup?.();
    this._mixingCleanup = null;
  }
}

export const audioCaptureElectron: IAudioCapture = new AudioCaptureElectronImpl();
