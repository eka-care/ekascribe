import { getPlatform, getHost } from '@/platform';

const MAC_MIC_SETTINGS_URL =
  'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone';

function isMacOs(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Macintosh/.test(navigator.userAgent);
}

export async function openMacMicSettingsIfApplicable(): Promise<void> {
  if (getHost() !== 'desktop' || !isMacOs()) return;

  try {
    await getPlatform().system?.openExternal(MAC_MIC_SETTINGS_URL);
  } catch {
    // best-effort only
  }
}
