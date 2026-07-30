import fetchWrapper from '.';
import { GET_EKA_HOST } from './helper';

export type TGetV1AuthWhoAmIResponse = {
  status_code: number;
  message?: string;
  error?: string;
  identity: string;
  idp_id: string;
  primary_oid: string;
  uuid: string;
  workspace_id: string;
};

export async function getConnectAuthV1AccountWhoami(): Promise<TGetV1AuthWhoAmIResponse> {
  try {
    const headers = new Headers();
    headers.append('Content-Type', 'application/json');

    const options = {
      method: 'GET',
      headers,
    };

    const response = await fetchWrapper(
      `${GET_EKA_HOST()}/connect-auth/v1/account/whoami`,
      options
    );

    const data = await response.json();

    return {
      status_code: response.status,
      ...data,
    };
  } catch (error) {
    return {
      status_code: 500,
      error: error instanceof Error ? error.message : 'WhoAmI failed',
    } as TGetV1AuthWhoAmIResponse;
  }
}
