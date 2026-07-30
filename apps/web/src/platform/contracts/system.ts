export interface RuntimeStatus {
  host: string;
  version?: string;
}

/**
 * System / shell. Web → `window.open`; electron → `window.systemApi.*`.
 */
export interface ISystem {
  openExternal(url: string): Promise<void>;
  getRuntimeStatus(): Promise<RuntimeStatus>;
  onOpenUserDefaults?(callback: () => void): () => void;
  onLogout?(callback: () => void): () => void;
}
