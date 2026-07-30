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
  send_via_linked_device: false,
  auto_send_rate_limit: 1,
  allow_partner_emr_auto_send: false,
};

export const desktopSettingsWeb: IDesktopSettings = {
  async getNotificationPreferences() { return DEFAULT_NOTIFICATION_PREFS; },
  async updateNotificationPreferences(prefs) { return { ...DEFAULT_NOTIFICATION_PREFS, ...prefs }; },
  async getShortcutPreferences() { return DEFAULT_SHORTCUT_PREFS; },
  async updateShortcutPreferences(prefs) { return { ...DEFAULT_SHORTCUT_PREFS, ...prefs }; },
  async getWhatsAppAutoSendPrefs() { return DEFAULT_WA_PREFS; },
  async updateWhatsAppAutoSendPrefs(prefs) { return { ...DEFAULT_WA_PREFS, ...prefs }; },
  onWhatsAppPrefsUpdated(_callback) { return () => {}; },
};
