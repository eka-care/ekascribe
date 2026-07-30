'use client';

import { useQuery } from '@tanstack/react-query';
import { with401Retry } from '@/fetch-client/api-with-retry';
import { getSDK } from '@/features/session/services/sdk-provider';
import useVoice2RxStore from '@/store/store';

export function getEkascribeConfigQueryKey() {
  return ['get-ekascribe-config'];
}

const useGetEkascribeConfig = () => {
  const setLoggedInUserDetails = useVoice2RxStore((state) => state.setLoggedInUserDetails);

  const query = useQuery({
    queryKey: getEkascribeConfigQueryKey(),
    queryFn: async (): Promise<any> => {
      const configResponse = await with401Retry(
        () => getSDK().sessions.getConfig(),
        'get ekascribe config'
      );

      if (configResponse.status_code && configResponse.status_code >= 400) {
        return null;
      }

      if (configResponse.data?.user_details) {
        setLoggedInUserDetails(configResponse.data.user_details);
      }

      return configResponse.data ?? null;
    },
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
  });

  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
};

export default useGetEkascribeConfig;
