'use client';

import { useEffect, useState } from 'react';
import { getPlatform, type AudioInputDevice } from '@/platform';

interface Options {
  enabled: boolean;
}

interface Result {
  inputs: AudioInputDevice[];
  selectedDeviceId: string;
  setSelectedDeviceId: (id: string) => void;
}

export const useAudioInputDevices = ({ enabled }: Options): Result => {
  const [inputs, setInputs] = useState<AudioInputDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    getPlatform()
      .audioCapture?.enumerateInputs()
      .then((devices) => {
        if (cancelled) return;
        const audioInputs = devices.filter((d) => d.deviceId && d.deviceId !== 'default');
        setInputs(audioInputs);
        setSelectedDeviceId((current) => current || audioInputs[0]?.deviceId || '');
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { inputs, selectedDeviceId, setSelectedDeviceId };
};
