import fetchWrapper from '.';
import { GET_EKA_HOST, GET_REFRESH_TOKEN } from './helper';

export async function postV1AuthAccountLogout(): Promise<{
  status_code: number;
  message?: string;
  error?: string;
}> {
  try {
    const headers = new Headers();
    headers.append('Content-Type', 'application/json');

    // Desktop has no cookies — pass the refresh token so the server can revoke it.
    const refreshToken = GET_REFRESH_TOKEN();
    const options = {
      method: 'POST',
      headers,
      ...(refreshToken ? { body: JSON.stringify({ refresh_token: refreshToken }) } : {}),
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
