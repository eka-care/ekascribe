import { useCallback } from 'react';
import { toast } from 'sonner';

const SESSION_LIMIT_TOAST = 'Session limit reached. Please upgrade to continue.';

interface UseSessionLimitGuardOptions {
  isLimitExceeded: boolean;
  onShowLimitDialog?: () => void;
}

export const useSessionLimitGuard = ({
  isLimitExceeded,
  onShowLimitDialog,
}: UseSessionLimitGuardOptions) => {
  const showLimitToast = useCallback(() => {
    toast.info(SESSION_LIMIT_TOAST);
  }, []);

  const showLimitDialog = useCallback(() => {
    onShowLimitDialog?.();
  }, [onShowLimitDialog]);

  /** Use as onClick guard — returns true if blocked. */
  const guardAction = useCallback(
    (action: () => void) => {
      if (isLimitExceeded) {
        showLimitToast();
        return;
      }
      action();
    },
    [isLimitExceeded, showLimitToast]
  );

  return {
    isLimitExceeded,
    showLimitToast,
    showLimitDialog,
    guardAction,
    disabledClickHandler: isLimitExceeded ? showLimitToast : undefined,
  };
};
