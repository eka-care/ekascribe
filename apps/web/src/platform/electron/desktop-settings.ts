import type {
  IDesktopSettings,
  NotificationPreferences,
  ShortcutPreferences,
  WhatsAppAutoSendPreferences,
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

const DEFAULT_WA_PREFS: WhatsAppAutoSendPreferences = {
  send_via_linked_device: true,
  auto_send_rate_limit: 1,
  allow_partner_emr_auto_send: true,
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

  async getWhatsAppAutoSendPrefs() {
    if (typeof window.desktopSettingsApi?.getWhatsAppAutoSendPrefs !== 'function') {
      return DEFAULT_WA_PREFS;
    }
    return window.desktopSettingsApi.getWhatsAppAutoSendPrefs();
  },

  async updateWhatsAppAutoSendPrefs(prefs) {
    if (typeof window.desktopSettingsApi?.updateWhatsAppAutoSendPrefs !== 'function') {
      return { ...DEFAULT_WA_PREFS, ...prefs };
    }
    return window.desktopSettingsApi.updateWhatsAppAutoSendPrefs(prefs);
  },

  onWhatsAppPrefsUpdated(callback) {
    if (typeof window.desktopSettingsApi?.onWhatsAppPrefsUpdated !== 'function') {
      return () => {};
    }
    return window.desktopSettingsApi.onWhatsAppPrefsUpdated(callback);
  },
};
