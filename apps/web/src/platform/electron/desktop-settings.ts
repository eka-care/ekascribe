import type {
  IDesktopSettings,
  NotificationPreferences,
  ShortcutPreferences,
} from '../contracts/desktop-settings';

const DEFAULT_NOTIFICATION_PREFS: NotificationPreferences = {
  joinVideoConferencingAndStartTranscribing: true,
  meetingIsBeingRecorded: true,
  meetingIsSummarized: true,
};

const DEFAULT_SHORTCUT_PREFS: ShortcutPreferences = {
  enabled: true,
  shortcut: 'Ctrl + S',
};

export const desktopSettingsElectron: IDesktopSettings = {
  async getNotificationPreferences() {
    if (typeof window.desktopSettingsApi?.getNotificationPreferences !== 'function') {
      return DEFAULT_NOTIFICATION_PREFS;
    }
    return window.desktopSettingsApi.getNotificationPreferences();
  },

  async updateNotificationPreferences(prefs) {
    if (typeof window.desktopSettingsApi?.updateNotificationPreferences !== 'function') {
      return { ...DEFAULT_NOTIFICATION_PREFS, ...prefs };
    }
    return window.desktopSettingsApi.updateNotificationPreferences(prefs);
  },

  async getShortcutPreferences() {
    if (typeof window.desktopSettingsApi?.getShortcutPreferences !== 'function') {
      return DEFAULT_SHORTCUT_PREFS;
    }
    return window.desktopSettingsApi.getShortcutPreferences();
  },

  async updateShortcutPreferences(prefs) {
    if (typeof window.desktopSettingsApi?.updateShortcutPreferences !== 'function') {
      return { ...DEFAULT_SHORTCUT_PREFS, ...prefs };
    }
    return window.desktopSettingsApi.updateShortcutPreferences(prefs);
  },

};
