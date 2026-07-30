import fetchWrapper from '.';
import { GET_EKA_HOST } from './helper';

export async function postV1AuthAccountLogout(): Promise<{
  status_code: number;
  message?: string;
  error?: string;
}> {
  try {
    const headers = new Headers();
    headers.append('Content-Type', 'application/json');

    const options = {
      method: 'POST',
      headers,
    };

    const response = await fetchWrapper(
      `${GET_EKA_HOST()}/connect-auth/v1/account/logout`,
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
      error: error instanceof Error ? error.message : 'Logout failed',
    };
  }
}
