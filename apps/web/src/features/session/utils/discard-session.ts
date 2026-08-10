import useVoice2RxStore from '@/store/store';
import { with401Retry } from '@/fetch-client/api-with-retry';
import { tracker } from '@/analytics';
import * as sdkService from '../services/sdk-service';

/**
 * Shared discard logic used by both useSessionLifecycle and useErrorHandlers.
 * Cancels the session on the backend, clears store state, and navigates away.
 */
export function discardAndCleanup(
  sessionId: string,
  navigate: () => void,
  source?: string
) {
  const store = useVoice2RxStore.getState();

  tracker.log({
    name: 'discard_session',
    properties: { session_id: sessionId, ...(source ? { source } : {}) },
  });

  with401Retry(() => sdkService.cancelSession(sessionId), 'cancel session');
  store.clearSessionV2Content(sessionId);
  store.clearRecordingSessionId();
  store.clearStore();
  store.refreshPastSessionsCallback?.();
  store.setWarningInfo({
    message: 'Session was discarded',
    type: 'success',
    screen: 'start_session',
  });

  navigate();
}
