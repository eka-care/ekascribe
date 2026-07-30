import type { IHostBridge, ScribeRecordingStatus } from '../contracts';

type MessageType = 'scribe:start' | 'scribe:stop' | 'scribe:setup';

/**
 * Electron host bridge — lets the DeskDocEka host drive scribe recording and receive status.
 * Prefers the native `window.scribeApi` callbacks (feature-detected, P4); when absent it falls
 * back to `postMessage` from the host window. Status is reported through `scribeApi.reportStatus`
 * and mirrored to the parent window via `postMessage`. Absent bridge ⇒ inert, no crash.
 */
export class HostBridgeElectronImpl implements IHostBridge {
  onStart(handler: () => void): () => void {
    if (typeof window.scribeApi?.onStartRequest === 'function') {
      return window.scribeApi.onStartRequest(handler);
    }
    if (typeof window.scribeApi?.onStart === 'function') {
      window.scribeApi.onStart(handler);
      return () => {};
    }
    return this.listen('scribe:start', () => handler());
  }

  onStop(handler: () => void): () => void {
    if (typeof window.scribeApi?.onStopRequest === 'function') {
      return window.scribeApi.onStopRequest(handler);
    }
    if (typeof window.scribeApi?.onStop === 'function') {
      window.scribeApi.onStop(handler);
      return () => {};
    }
    return this.listen('scribe:stop', () => handler());
  }

  onSetup(handler: (payload: unknown) => void): () => void {
    if (typeof window.scribeApi?.onSetupScribeApp === 'function') {
      return window.scribeApi.onSetupScribeApp(handler);
    }
    return this.listen('scribe:setup', (data) => handler(data?.payload));
  }

  onPause(handler: () => void): () => void {
    if (typeof window.scribeApi?.onPauseRequest === 'function') {
      return window.scribeApi.onPauseRequest(handler);
    }
    return () => {};
  }

  onResume(handler: () => void): () => void {
    if (typeof window.scribeApi?.onResumeRequest === 'function') {
      return window.scribeApi.onResumeRequest(handler);
    }
    return () => {};
  }

  onGetStatusRequest(handler: () => { processingStatus: string; sessionId: string | null }): () => void {
    if (typeof window.scribeApi?.onGetStatusRequest === 'function') {
      return window.scribeApi.onGetStatusRequest(handler);
    }
    return () => {};
  }

  onViewTransaction(handler: (transactionId: string) => void): () => void {
    if (typeof window.scribeApi?.onViewTransaction === 'function') {
      return window.scribeApi.onViewTransaction(handler);
    }
    return () => {};
  }

  onStartWithAppointment(handler: (data: unknown) => void): () => void {
    if (typeof window.scribeApi?.onStartWithAppointmentRequest === 'function') {
      return window.scribeApi.onStartWithAppointmentRequest(handler);
    }
    return () => {};
  }

  reportStatus(status: ScribeRecordingStatus): void {
    if (typeof window.scribeApi?.reportStatus === 'function') {
      window.scribeApi.reportStatus(status);
    }
    if (typeof window !== 'undefined' && window.parent) {
      window.parent.postMessage({ source: 'scribe-web', type: 'scribe:status', status }, '*');
    }
  }

  updateStatus(processingStatus: string, sessionId: string | null): void {
    if (typeof window.scribeApi?.updateStatus === 'function') {
      window.scribeApi.updateStatus(processingStatus, sessionId);
    }
  }

  notifyProcessingCompleted(transactionId: string, status: string): void {
    if (typeof window.scribeApi?.notifyProcessingCompleted === 'function') {
      window.scribeApi.notifyProcessingCompleted(transactionId, status);
    }
  }

  notifySessionDiscarded(): void {
    if (typeof window.scribeApi?.notifySessionDiscarded === 'function') {
      window.scribeApi.notifySessionDiscarded();
    }
  }

  notifyError(errorCode: string, errorMessage: string): void {
    if (typeof window.scribeApi?.notifyError === 'function') {
      window.scribeApi.notifyError(errorCode, errorMessage);
    }
  }

  notifyRendererReady(): void {
    if (typeof window.scribeApi?.notifyRendererReady === 'function') {
      window.scribeApi.notifyRendererReady();
    }
  }

  sendAppointments(data: unknown): void {
    if (typeof window.scribeApi?.sendAppointments === 'function') {
      window.scribeApi.sendAppointments(data);
    }
  }

  private listen(type: MessageType, handler: (data: { payload?: unknown }) => void): () => void {
    if (typeof window === 'undefined') return () => {};
    const listener = (event: MessageEvent) => {
      if (event.data?.type === type) handler(event.data);
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }
}

export const hostBridgeElectron: IHostBridge = new HostBridgeElectronImpl();
