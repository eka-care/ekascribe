import type { IAppUpdates } from '../contracts/app-updates';

export const appUpdatesElectron: IAppUpdates = {
  onUpdateAvailable(callback) {
    if (typeof window.desktopSettingsApi?.onUpdateAvailable === 'function') {
      return window.desktopSettingsApi.onUpdateAvailable(callback);
    }
    return () => {};
  },

  onUpdateProgress(callback) {
    if (typeof window.desktopSettingsApi?.onUpdateProgress === 'function') {
      return window.desktopSettingsApi.onUpdateProgress(callback);
    }
    return () => {};
  },

  onUpdateReady(callback) {
    if (typeof window.desktopSettingsApi?.onUpdateReady === 'function') {
      return window.desktopSettingsApi.onUpdateReady(callback);
    }
    return () => {};
  },

  async install() {
    await window.desktopSettingsApi?.relaunchAndInstall?.();
  },
};
