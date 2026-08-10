'use client';

import { useEffect, useState } from 'react';
import { tracker } from '@/analytics';

const useOnlineStatus = (): boolean => {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine
  );

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      tracker.log({ name: 'network_status_change', properties: { status: 'online' } });
    };
    const handleOffline = () => {
      setIsOnline(false);
      tracker.log({ name: 'network_status_change', properties: { status: 'offline' } });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    setIsOnline(navigator.onLine);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
};

export default useOnlineStatus;
