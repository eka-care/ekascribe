import type { INotifier, NotificationOptions } from '../contracts';

/**
 * Electron notifications adapter. Routes through the host (`window.notificationApi.show`,
 * feature-detected P4) for true native notifications; falls back to the renderer's Web
 * Notification API when the bridge is absent. Never throws.
 */
export class NotifierElectronImpl implements INotifier {
  async show(title: string, options?: NotificationOptions): Promise<void> {
    if (typeof window.notificationApi?.show === 'function') {
      await window.notificationApi.show({
        title,
        body: options?.body ?? '',
        silent: options?.silent,
      });
      return;
    }
    if (typeof Notification === 'undefined') return;

    let permission = Notification.permission;
    if (permission === 'default') {
      permission = await Notification.requestPermission();
    }
    if (permission !== 'granted') return;

    new Notification(title, options);
  }

  onClick(callback: (data: Record<string, unknown> | null) => void): () => void {
    if (typeof window.notificationApi?.onClick === 'function') {
      return window.notificationApi.onClick(callback);
    }
    return () => {};
  }
}

export const notifierElectron: INotifier = new NotifierElectronImpl();
