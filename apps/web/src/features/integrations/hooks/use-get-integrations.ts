'use client';

import { useCallback, useEffect, useState } from 'react';
import { with401Retry } from '@/fetch-client/api-with-retry';
import {
  getVoiceV1Integrations,
  TIntegration,
} from '@/fetch-client/get-voice-v1-integrations';

const useGetIntegrations = () => {
  const [integrations, setIntegrations] = useState<TIntegration[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const fetchIntegrations = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await with401Retry(getVoiceV1Integrations, 'get integrations');

      if (response.status_code >= 400) {
        setError(response.error ?? 'Failed to fetch integrations');
        return;
      }

      setIntegrations(response.data?.integrations ?? []);
    } catch (e) {
      setError(e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIntegrations();
  }, [fetchIntegrations]);

  const toggleIntegration = useCallback((id: string) => {
    setIntegrations((prev) =>
      prev.map((integration) => {
        if (integration.id === id && integration.integration_status === 'available') {
          return {
            ...integration,
            link_status: integration.link_status === 'enabled' ? 'disabled' : 'enabled',
          };
        }
        return integration;
      })
    );
  }, []);

  return { integrations, isLoading, error, toggleIntegration };
};

export default useGetIntegrations;
