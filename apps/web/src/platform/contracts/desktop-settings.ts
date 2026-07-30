export type NotificationPreferences = {
  joinVideoConferencingAndStartTranscribing: boolean;
  meetingIsBeingRecorded: boolean;
  meetingIsSummarized: boolean;
};

export type ShortcutPreferences = {
  enabled: boolean;
  shortcut: string;
};

export type WhatsAppAutoSendPreferences = {
  send_via_linked_device: boolean;
  auto_send_rate_limit: number;
  allow_partner_emr_auto_send: boolean;
};

export interface IDesktopSettings {
  getNotificationPreferences(): Promise<NotificationPreferences>;
  updateNotificationPreferences(prefs: Partial<NotificationPreferences>): Promise<NotificationPreferences>;
  getShortcutPreferences(): Promise<ShortcutPreferences>;
  updateShortcutPreferences(prefs: Partial<ShortcutPreferences>): Promise<ShortcutPreferences>;
  getWhatsAppAutoSendPrefs(): Promise<WhatsAppAutoSendPreferences>;
  updateWhatsAppAutoSendPrefs(prefs: Partial<WhatsAppAutoSendPreferences>): Promise<WhatsAppAutoSendPreferences>;
  onWhatsAppPrefsUpdated(callback: (prefs: WhatsAppAutoSendPreferences) => void): () => void;
}
