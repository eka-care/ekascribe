'use client';

import { useEffect, useState } from 'react';
import { Button } from '@ui/src';
import { WifiOff, RefreshCw } from 'lucide-react';
import useOnlineStatus from '@/shared-hooks/use-online-status';
import { handleUserLogout } from '@/utils/user-auth-logout-utility-methods';

type Props = {
  onRetry: () => Promise<unknown> | void;
};

const OfflineScreen = ({ onRetry }: Props) => {
  const isOnline = useOnlineStatus();
  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetry = async () => {
    if (isRetrying) return;
    setIsRetrying(true);
    try {
      await onRetry();
    } finally {
      setIsRetrying(false);
    }
  };

  useEffect(() => {
    if (isOnline) {
      void handleRetry();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  return (
    <div className="fixed inset-0 z-50 bg-background overflow-hidden flex justify-center items-center px-6">
      <div className="flex flex-col items-center gap-4 max-w-md text-center">
        <div className="flex items-center justify-center w-14 h-14 rounded-full bg-muted">
          <WifiOff className="w-7 h-7 text-muted-foreground" />
        </div>
        <div className="flex flex-col gap-1">
          <p className="font-semibold text-lg">You&apos;re offline</p>
          <p className="text-sm text-muted-foreground">
            We can&apos;t reach the server right now. Check your connection and try again — your
            session is still active.
          </p>
        </div>
        <div className="flex items-center gap-3 mt-2">
          <Button onClick={handleRetry} disabled={isRetrying} className="cursor-pointer">
            <RefreshCw className={`w-4 h-4 mr-2 ${isRetrying ? 'animate-spin' : ''}`} />
            {isRetrying ? 'Reconnecting…' : 'Reconnect'}
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              await handleUserLogout();
            }}
            className="cursor-pointer"
          >
            Logout
          </Button>
        </div>
      </div>
    </div>
  );
};

export default OfflineScreen;
