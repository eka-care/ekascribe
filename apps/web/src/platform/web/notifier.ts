import type { INotifier, NotificationOptions } from '../contracts';

/**
 * OS notifications via the Web Notification API. Requests permission on first use and
 * degrades to a no-op when unsupported or denied — never throws. `window`/`Notification`
 * are touched only inside the method, so the module is SSR-safe.
 */
export class NotifierWebImpl implements INotifier {
  async show(title: string, options?: NotificationOptions): Promise<void> {
    if (typeof window === 'undefined' || typeof Notification === 'undefined') return;

    let permission = Notification.permission;
    if (permission === 'default') {
      permission = await Notification.requestPermission();
    }
    if (permission !== 'granted') return;

    new Notification(title, options);
  }
}

export const notifierWeb: INotifier = new NotifierWebImpl();
