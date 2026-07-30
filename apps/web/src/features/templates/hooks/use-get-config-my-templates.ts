'use client';

import { useQuery } from '@tanstack/react-query';
import { with401Retry } from '@/fetch-client/api-with-retry';
import { getSDK } from '@/features/session/services/sdk-provider';
import useVoice2RxStore from '@/store/store';

export function getConfigMyTemplatesQueryKey() {
  return ['get-config-my-templates'];
}

const useGetConfigMyTemplates = () => {
  const setUserSelectedTemplatesList = useVoice2RxStore(
    (state) => state.setUserSelectedTemplatesList
  );

  const query = useQuery({
    queryKey: getConfigMyTemplatesQueryKey(),
    queryFn: async () => {
      const configResponse = await with401Retry(
        () => getSDK().sessions.getConfigMyTemplates(),
        'get ekascribe config'
      );

      if (configResponse.status_code && configResponse.status_code >= 400) return [];

      const userSelectedTemplatesList = configResponse.data?.my_templates || [];

      setUserSelectedTemplatesList(userSelectedTemplatesList);

      return userSelectedTemplatesList;
    },

    staleTime: Infinity,
    gcTime: Infinity,
  });

  return query;
};

export default useGetConfigMyTemplates;
