/**
 * Host + auth state for the fetch client. Hosts are same-origin relative URLs
 * (see src/config/hosts.ts). The setEnv() surface is preserved so call sites
 * don't change.
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
export default setEnv;
