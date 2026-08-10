/**
 * Host + auth state for the fetch client — env-driven for on-prem (Phase 5).
 * Was a PROD|DEV enum of eka-cloud hosts; now everything derives from
 * NEXT_PUBLIC_API_HOST (see src/config/hosts.ts) with per-host overrides.
 * The setEnv() surface is preserved so call sites don't change.
 */
import { HOSTS } from '@/config/hosts';

let client_id = 'doc-web';
let auth: string;
let refresh: string | undefined;

const setEnv = ({
  clientId,
  auth_token,
  refresh_token,
}: {
  env?: 'PROD' | 'DEV'; // kept for signature compat; hosts come from env vars now
  clientId?: string;
  auth_token: string;
  refresh_token?: string;
}) => {
  if (clientId) {
    client_id = clientId;
  }
  auth = auth_token;
  if (refresh_token !== undefined) {
    refresh = refresh_token;
  }
};

export const GET_EKA_HOST = () => HOSTS.EKA_HOST;
export const GET_CLIENT_ID = () => client_id;
export const GET_AUTH_TOKEN = () => auth;
export const GET_REFRESH_TOKEN = () => refresh;
export const GET_EKA_V2RX_HOST_V2 = () => HOSTS.EKA_V2RX_HOST_V2;
export const GET_EKA_V2RX_HOST_V3 = () => HOSTS.EKA_V2RX_HOST_V3;
export const GET_AORTAGO_HOST = () => HOSTS.AORTAGO_HOST;
export const GET_COG_HOST = () => HOSTS.COG_HOST;
export const GET_HUB_HOST = () => HOSTS.HUB_HOST;

export default setEnv;
