import fetchWrapper from '.';
import { GET_EKA_HOST } from './helper';

export type TIntegration = {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  integration_status: 'available' | 'coming_soon';
  link_status: 'enabled' | 'disabled' | 'contact_support';
  tags: string[];
};

export type TGetVoiceV1IntegrationsResponse = {
  status_code: number;
  data?: {
    integrations: TIntegration[];
  };
  error?: string;
};

export async function getVoiceV1Integrations(): Promise<TGetVoiceV1IntegrationsResponse> {
  try {
    const response = await fetchWrapper(`${GET_EKA_HOST()}/voice/api/v1/integrations`, {
      method: 'GET',
    });

    const data = await response.json();

    return {
      status_code: response.status,
      ...data,
    };
  } catch (error) {
    return {
      status_code: 500,
      error: error instanceof Error ? error.message : 'Failed to fetch integrations',
    };
  }
}
