export type NotificationPreferences = {
  joinVideoConferencingAndStartTranscribing: boolean;
  meetingIsBeingRecorded: boolean;
  meetingIsSummarized: boolean;
};

export type ShortcutPreferences = {
  enabled: boolean;
  shortcut: string;
};

export interface IDesktopSettings {
  getNotificationPreferences(): Promise<NotificationPreferences>;
  updateNotificationPreferences(prefs: Partial<NotificationPreferences>): Promise<NotificationPreferences>;
  getShortcutPreferences(): Promise<ShortcutPreferences>;
  updateShortcutPreferences(prefs: Partial<ShortcutPreferences>): Promise<ShortcutPreferences>;
}
