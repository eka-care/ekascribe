export const FLAVOUR = 'ekascribe-web';

import { HOSTS } from '@/config/hosts';

// On-prem: login/switch URLs are env-driven (NEXT_PUBLIC_LOGIN_URL etc.).
export const LOGOUT_PROD_URL = HOSTS.LOGIN_URL;
export const LOGOUT_DEV_URL = HOSTS.LOGIN_URL;

export const SWITCH_WORKSPACE_PROD_URL = HOSTS.SWITCH_WORKSPACE_URL;
export const SWITCH_WORKSPACE_DEV_URL = HOSTS.SWITCH_WORKSPACE_URL;

