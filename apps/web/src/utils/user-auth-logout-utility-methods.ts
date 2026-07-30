import { resetTracking } from '@/analytics';
import { LOGOUT_DEV_URL, LOGOUT_PROD_URL } from '@/constants/constant';
import { with401Retry } from '@/fetch-client/api-with-retry';
import { postV1AuthAccountLogout } from '@/fetch-client/post-v1-auth-account-logout';
import { getStorage, getHost, getAuthTokens } from '@/platform';
import useVoice2RxStore from '@/store/store';
import { logoutMedicalRecords } from '@eka-care/medical-records-ui';

const handleUserLogout = async () => {
  try {
    // Best-effort server-side logout. Even if this fails, user is already logged out locally.
    await with401Retry(() => postV1AuthAccountLogout(), 'user logout');
  } catch (error) {
    console.error('Logout error:', error);
  } finally {
    // This function is intentionally non-recursive and safe to call from low-level utilities.
    forceUserLogout();
  }
};

/**
 * Force client-side logout without making any API calls.
 * Safe to call from deep utility layers (e.g., 401 retry handler) without causing recursion.
 */
const forceUserLogout = () => {
  handleUserClearStoreAfterLogout();
  handleUserRedirectAfterLogout();
};

const handleUserRedirectAfterLogout = () => {
  if (getHost() === 'desktop') {
    // Tell the host to clear its OIDC session and show the native login.
    // Never redirect to login.eka.care on desktop.
    getAuthTokens()?.logout().catch(() => {});
    return;
  }

  const redirectURL = process.env.NEXT_PUBLIC_ENV === 'PROD' ? LOGOUT_PROD_URL : LOGOUT_DEV_URL;

  // Add popstate listener to handle back button after logout
  // This prevents old route params from being appended to the login URL
  const handleBackAfterLogout = () => {
    // Prevent navigation and stay on clean login page
    window.location.replace(redirectURL);
  };

  window.addEventListener('popstate', handleBackAfterLogout);

  // Rename current history entry to a neutral same-origin path, then hard-redirect.
  // Note: History API cannot navigate to another origin; we only use it to avoid exposing the last protected path.
  try {
    window.history.replaceState(null, '', '/logged-out');
  } catch (_) {
    // no-op
  }

  window.location.replace(redirectURL);
  return;
};

const handleUserClearStoreAfterLogout = () => {
  const bid = useVoice2RxStore.getState().loggedInUserDetails?.['b-id'];
  void logoutMedicalRecords(bid);
  resetTracking();
  const clearStore = useVoice2RxStore.getState().clearStore;
  const clearOnboardingState = useVoice2RxStore.getState().clearOnboardingState;
  const setSelectedMicrophone = useVoice2RxStore.getState().setSelectedMicrophone;
  clearStore();

  clearOnboardingState();
  setSelectedMicrophone(null);

  getStorage().local.clear();
  getStorage().session.clear();
  indexedDB.deleteDatabase('TrinityProfilesDB');
  indexedDB.deleteDatabase('ScribeAudioChunksDB');
};

export {
  handleUserLogout,
  forceUserLogout,
  handleUserRedirectAfterLogout,
  handleUserClearStoreAfterLogout,
};
