import type { IAppUpdates } from '../contracts/app-updates';

export const appUpdatesWeb: IAppUpdates = {
  onUpdateAvailable(_callback) { return () => {}; },
  onUpdateProgress(_callback) { return () => {}; },
  onUpdateReady(_callback) { return () => {}; },
  async install() {},
};
