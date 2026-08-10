'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { with401Retry } from '@/fetch-client/api-with-retry';
import { getConnectAuthV1AccountWhoami } from '@/fetch-client/get-connect-auth-v1-account-whoami';
import { identifyUser } from '@/analytics';
import { handleUserLogout } from '@/utils/user-auth-logout-utility-methods';

export function getWhoAmIQueryKey() {
  return ['get-who-am-i'];
}

const useGetWhoAmI = () => {
  const query = useQuery({
    queryKey: getWhoAmIQueryKey(),
    queryFn: async () => {
      // Throw on failure so react-query's bounded retry applies — swallowing the
      // error here made the guard spin on an identity that never resolved.
      const profile = await with401Retry(() => getConnectAuthV1AccountWhoami(), 'who-am-i-query');

      if (!profile || profile.status_code !== 200) {
        throw new Error(`whoami failed (${profile?.status_code ?? 'no response'})`);
      }

      identifyUser({
        OID: profile.primary_oid,
        UUID: profile.uuid,
        BID: profile.workspace_id,
      });

      return profile;
    },
    retry: 3,
    staleTime: Infinity,
    gcTime: Infinity,
    // We'll control refetching on visibility change explicitly
    refetchOnWindowFocus: false,
  });

  // 3 retries exhausted and whoami still failing — end the session: best-effort
  // logout API call, clear local state, redirect to login.
  useEffect(() => {
    if (query.isError) void handleUserLogout();
  }, [query.isError]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        query.refetch();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [query]);

  return query;
};

export default useGetWhoAmI;
