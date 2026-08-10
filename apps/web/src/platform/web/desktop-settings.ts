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

export const desktopSettingsWeb: IDesktopSettings = {
  async getNotificationPreferences() { return DEFAULT_NOTIFICATION_PREFS; },
  async updateNotificationPreferences(prefs) { return { ...DEFAULT_NOTIFICATION_PREFS, ...prefs }; },
  async getShortcutPreferences() { return DEFAULT_SHORTCUT_PREFS; },
  async updateShortcutPreferences(prefs) { return { ...DEFAULT_SHORTCUT_PREFS, ...prefs }; },
};
