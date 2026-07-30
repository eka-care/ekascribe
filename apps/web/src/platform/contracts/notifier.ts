export interface NotificationOptions {
  body?: string;
  icon?: string;
  silent?: boolean;
}

/**
 * Notifications. Web → Web Notification API; electron → `window.notificationApi.show()`.
 */
export interface INotifier {
  show(title: string, options?: NotificationOptions): Promise<void>;
  onClick?(callback: (data: Record<string, unknown> | null) => void): () => void;
}
