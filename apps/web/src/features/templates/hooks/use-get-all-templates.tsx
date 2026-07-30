'use client';

import { useQuery } from '@tanstack/react-query';
import { with401Retry } from '@/fetch-client/api-with-retry';
import { getSDK } from '@/features/session/services/sdk-provider';
import { TTemplateData } from '@/constants/types';
import useVoice2RxStore from '@/store/store';

export function getAllTemplatesQueryKey() {
  return ['all-templates'];
}

export const useGetAllTemplates = () => {
  const setTemplateNameById = useVoice2RxStore((state) => state.setTemplateNameById);

  const query = useQuery({
    queryKey: getAllTemplatesQueryKey(),
    queryFn: async (): Promise<TTemplateData[]> => {
      const response = await with401Retry(
        () => getSDK().documents.getAllTemplates(),
        'get all templates'
      );

      const { items: templates, status_code: statusCode } = response;

      if (statusCode >= 400) return [];

      const list = templates ?? [];

      // Keep an id -> name map.
      const nameById: Record<string, string> = {};
      for (const template of list) {
        if (template.id) nameById[template.id] = template.title ?? '';
      }
      setTemplateNameById(nameById);

      return list;
    },
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });

  return {
    data: query.data ?? [],
    loading: query.isLoading,
    error: query.error ? 'Failed to fetch templates' : null,
    refetch: query.refetch,
  };
};
