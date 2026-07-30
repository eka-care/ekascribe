export interface IAppUpdates {
  onUpdateAvailable(callback: (info: { version: string }) => void): () => void;
  onUpdateProgress(callback: (info: { percent: number }) => void): () => void;
  onUpdateReady(callback: () => void): () => void;
  install(): Promise<void>;
}
