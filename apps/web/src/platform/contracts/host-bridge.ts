export type ScribeRecordingStatus = 'idle' | 'recording' | 'paused' | 'processing' | 'error';

/**
 * Host command bridge — lets the host (DeskDocEka) drive scribe recording control and
 * receive status. Web → no-op; electron → `window.scribeApi` + `postMessage`.
 * Absorbs `electron-scribe-window-bridge.tsx` / `electron-scribe-ipc-listener.tsx`.
 */
export interface IHostBridge {
  // subscriptions — host → renderer
  onStart(handler: () => void): () => void;
  onStop(handler: () => void): () => void;
  onSetup(handler: (payload: unknown) => void): () => void;
  onPause(handler: () => void): () => void;
  onResume(handler: () => void): () => void;
  onGetStatusRequest(handler: () => { processingStatus: string; sessionId: string | null }): () => void;
  onViewTransaction(handler: (transactionId: string) => void): () => void;
  onStartWithAppointment(handler: (data: unknown) => void): () => void;
  // notifications — renderer → host
  reportStatus(status: ScribeRecordingStatus): void;
  updateStatus(processingStatus: string, sessionId: string | null): void;
  notifyProcessingCompleted(transactionId: string, status: string): void;
  notifySessionDiscarded(): void;
  notifyError(errorCode: string, errorMessage: string): void;
  notifyRendererReady(): void;
  sendAppointments(data: unknown): void;
}
