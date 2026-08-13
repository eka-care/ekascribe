export const FLAVOUR = 'ekascribe-web';

import { HOSTS } from '@/config/hosts';

// Same-origin relative URLs (see src/config/hosts.ts).
export const LOGOUT_PROD_URL = HOSTS.LOGIN_URL;
export const LOGOUT_DEV_URL = HOSTS.LOGIN_URL;

export const SWITCH_WORKSPACE_PROD_URL = HOSTS.SWITCH_WORKSPACE_URL;
export const SWITCH_WORKSPACE_DEV_URL = HOSTS.SWITCH_WORKSPACE_URL;

// Desktop installer URLs — latest release assets from the ekascribe-desktop repo.
export const DOWNLOAD_URLS = {
  mac: 'https://github.com/eka-care/ekascribe-desktop/releases/latest/download/Vaarta.dmg',
  windows:
    'https://github.com/eka-care/ekascribe-desktop/releases/latest/download/Vaarta%20Setup.exe',
} as const;

