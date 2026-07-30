import type { IHostBridge, ScribeRecordingStatus } from '../contracts';

/**
 * Web host bridge — there is no host in a browser, so all methods are inert.
 * Keeps consuming lifecycle code identical across platforms; desktop does the real work.
 */
export class HostBridgeWebImpl implements IHostBridge {
  onStart(): () => void { return () => {}; }
  onStop(): () => void { return () => {}; }
  onSetup(): () => void { return () => {}; }
  onPause(): () => void { return () => {}; }
  onResume(): () => void { return () => {}; }
  onGetStatusRequest(): () => void { return () => {}; }
  onViewTransaction(): () => void { return () => {}; }
  onStartWithAppointment(): () => void { return () => {}; }
  reportStatus(_status: ScribeRecordingStatus): void {}
  updateStatus(_processingStatus: string, _sessionId: string | null): void {}
  notifyProcessingCompleted(_transactionId: string, _status: string): void {}
  notifySessionDiscarded(): void {}
  notifyError(_errorCode: string, _errorMessage: string): void {}
  notifyRendererReady(): void {}
  sendAppointments(_data: unknown): void {}
}

export const hostBridgeWeb: IHostBridge = new HostBridgeWebImpl();
