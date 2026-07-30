'use client';

import { useCallback, useEffect, useState } from 'react';
import { useMicrophonePermission } from '@/features/session/hooks/use-microphone-permission';
import { getPlatform, type MicPermissionState } from '@/platform';

export type MicPermissionStatus = 'unknown' | 'prompt' | 'granted' | 'denied' | 'unsupported';

interface Options {
  skip: boolean;
}

interface Result {
  status: MicPermissionStatus;
  isGranted: boolean;
  requestPermission: () => Promise<void>;
}

export const useMicPermissionStatus = ({ skip }: Options): Result => {
  const [status, setStatus] = useState<MicPermissionStatus>(skip ? 'granted' : 'unknown');

  const { checkMicrophonePermission } = useMicrophonePermission({
    screen_name: 'onboarding',
  });

  const applyState = useCallback((state: MicPermissionState) => {
    if (state === 'granted') setStatus('granted');
    else if (state === 'denied') setStatus('denied');
    else if (state === 'prompt') setStatus('prompt');
    else if (state === 'unsupported') setStatus('unsupported');
  }, []);

  const requestPermission = useCallback(async () => {
    const state = (await getPlatform().audioCapture?.requestPermission()) ?? 'unsupported';
    applyState(state);
  }, [applyState]);

  useEffect(() => {
    if (skip) {
      setStatus('granted');
      return;
    }

    let cancelled = false;

    (async () => {
      await checkMicrophonePermission();
      if (cancelled) return;
      const state = (await getPlatform().audioCapture?.queryPermission()) ?? 'unsupported';
      if (!cancelled) applyState(state);
    })();

    const unsub = getPlatform().audioCapture?.onPermissionChange((state) => {
      if (!cancelled) applyState(state);
    });

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [skip, checkMicrophonePermission, applyState]);

  return {
    status,
    isGranted: status === 'granted',
    requestPermission,
  };
};
