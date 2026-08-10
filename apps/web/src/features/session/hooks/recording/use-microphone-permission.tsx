'use client';

import useVoice2RxStore from '@/store/store';
import { useCallback } from 'react';
import { AlertCircleIcon, RotateCcwIcon } from 'lucide-react';
import { TWarningScreen } from '@/store/types';
import { getPlatform } from '@/platform';
import { openMacMicSettingsIfApplicable } from '@/utils/open-mac-microphone-settings';
import { tracker } from '@/analytics';

export const useMicrophonePermission = ({
  screen_name,
  onPermissionChange,
}: {
  screen_name: TWarningScreen | undefined;
  onPermissionChange?: (granted: boolean) => void;
}) => {
  const { setWarningInfo, clearWarningInfo } = useVoice2RxStore();

  const reportPermission = (granted: boolean) => {
    onPermissionChange?.(granted);
    return granted;
  };

  const checkMicrophonePermission = useCallback(async () => {
    try {
      const state = (await getPlatform().audioCapture?.requestPermission()) ?? 'unsupported';

      if (state === 'granted') {
        clearWarningInfo();
        return reportPermission(true);
      }

      if (state === 'prompt') {
        setWarningInfo({
          screen: screen_name,
          message:
            'Microphone access needed. In the popup, select "Allow while visiting this site" to continue.',
          Icon: () => <AlertCircleIcon className="text-yellow-8 w-4 h-4" />,
          ActionComponent: () => (
            <div
              className="flex items-center space-x-1 cursor-pointer text-primary hover:text-primary/80 font-semibold text-xs underline"
              onClick={() => {
                void (async () => {
                  await openMacMicSettingsIfApplicable();
                  clearWarningInfo();
                  checkMicrophonePermission();
                })();
              }}
            >
              <RotateCcwIcon className="w-4 h-4" />
              <div className="CalloutBold">Recheck Access</div>
            </div>
          ),
        });
        return reportPermission(false);
      }

      if (state === 'denied') {
        tracker.log({ name: 'mic_permission_denied' });
        setWarningInfo({
          screen: screen_name,
          message: 'Microphone access blocked.',
          Icon: () => <AlertCircleIcon className="text-yellow-8 w-4 h-4" />,
          ActionComponent: () => (
            <div
              className="flex items-center space-x-1 cursor-pointer text-primary hover:text-primary/80 font-semibold text-xs underline"
              onClick={() => {
                clearWarningInfo();
                checkMicrophonePermission();
              }}
            >
              <RotateCcwIcon className="w-4 h-4" />
              <div className="CalloutBold">Recheck permission</div>
            </div>
          ),
        });
        return reportPermission(false);
      }

      return reportPermission(false);
    } catch {
      setWarningInfo({
        screen: screen_name,
        message: 'Unable to access microphone. Please check permissions.',
        Icon: () => <AlertCircleIcon className="text-yellow-8 w-4 h-4" />,
        ActionComponent: () => (
          <div
            className="flex items-center space-x-1 cursor-pointer text-primary hover:text-primary/80 font-semibold text-xs underline"
            onClick={() => {
              clearWarningInfo();
              checkMicrophonePermission();
            }}
          >
            <RotateCcwIcon className="w-16 h-16" />
            <div className="CalloutBold">Retry</div>
          </div>
        ),
      });
      return reportPermission(false);
    }
  }, [clearWarningInfo, onPermissionChange, screen_name, setWarningInfo]);

  return {
    checkMicrophonePermission,
  };
};
