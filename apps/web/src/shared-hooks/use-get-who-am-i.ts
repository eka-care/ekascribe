'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { with401Retry } from '@/fetch-client/api-with-retry';
import { getConnectAuthV1AccountWhoami } from '@/fetch-client/get-connect-auth-v1-account-whoami';
import { identifyUser } from '@/analytics';

export function getWhoAmIQueryKey() {
  return ['get-who-am-i'];
}

const useGetWhoAmI = () => {
  const query = useQuery({
    queryKey: getWhoAmIQueryKey(),
    queryFn: async () => {
      try {
        const profile = await with401Retry(() => getConnectAuthV1AccountWhoami(), 'who-am-i-query');

        if (!profile || profile.status_code !== 200) return undefined;

        identifyUser({
          OID: profile.primary_oid,
          UUID: profile.uuid,
          BID: profile.workspace_id,
        });

        return profile;
      } catch {
        // Fail closed: if auth can't be verified, return no session instead of stale data.
        return undefined;
      }
    },
    staleTime: Infinity,
    gcTime: Infinity,
    // We'll control refetching on visibility change explicitly
    refetchOnWindowFocus: false,
  });

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
