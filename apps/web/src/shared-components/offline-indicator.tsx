'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';
import useOnlineStatus from '@/shared-hooks/use-online-status';

const OFFLINE_TOAST_ID = 'offline-indicator';

const OfflineIndicator = () => {
  const isOnline = useOnlineStatus();

  useEffect(() => {
    if (!isOnline) {
      toast.warning("You're offline", {
        id: OFFLINE_TOAST_ID,
        description: 'Changes will sync when you reconnect.',
        duration: Infinity,
      });
    } else {
      toast.dismiss(OFFLINE_TOAST_ID);
    }
  }, [isOnline]);

  return null;
};

export default OfflineIndicator;
