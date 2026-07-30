import { refreshToken } from './index';
import { handleUserLogout } from '@/utils/user-auth-logout-utility-methods';

export async function with401Retry<T>(
  apiCall: () => Promise<T & { status_code?: number; code?: number }>,
  apiName: string
): Promise<T> {
  const response = await apiCall();

  if (response?.code === 403 || response?.status_code === 403) {
    await handleUserLogout();
    return response;
  }

  if (response?.code === 401 || response?.status_code === 401) {
    const refreshSuccess = await refreshToken();

    if (refreshSuccess) {
      return await apiCall();
    } else {
      console.log('Token refresh failed.', apiName);
      // Refresh failed, so we must logout the user out
      await handleUserLogout();
    }
  }

  return response;
}
