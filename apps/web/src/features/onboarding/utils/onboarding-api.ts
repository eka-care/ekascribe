import { with401Retry } from '@/fetch-client/api-with-retry';
import { getSDK } from '@/features/session/services/sdk-provider';
import { toast } from 'sonner';

type UpdateConfigData = {
  onboarding_step?: string;
  clinic_name?: string;
  specialization?: string;
  emr_name?: string;
  contact_number?: string;
  consult_language?: string[];
  microphone_permission_check?: boolean;
  [key: string]: any;
};

type UpdateOnboardingConfigParams = {
  data: UpdateConfigData;
  request_type?: 'user' | 'workspace';
  description?: string;
  showErrorToast?: boolean;
  query_params?: string;
};

/**
 * Common utility function to update onboarding configuration
 * @param params - Configuration parameters including data to update
 * @returns Object with success status and optional error
 */
export const updateOnboardingConfig = async ({
  data,
  request_type = 'user',
  description = 'update config',
  showErrorToast = true,
  query_params,
}: UpdateOnboardingConfigParams): Promise<{
  success: boolean;
  error?: string;
  statusCode?: number;
}> => {
  try {
    const response = await with401Retry(
      () =>
        getSDK().sessions.updateConfig({
          data,
          request_type,
          query_params,
        }),
      description
    );

    const { status_code: statusCode, error } = response;

    if (statusCode >= 400) {
      const errorMessage = error?.message || 'Something went wrong. Please try again.';
      if (showErrorToast) {
        toast.error(errorMessage);
      }
      return {
        success: false,
        error: errorMessage,
        statusCode,
      };
    }

    return { success: true, statusCode };
  } catch (error) {
    console.error(`Error in ${description}:`, error);
    const errorMessage = 'An unexpected error occurred. Please try again.';
    if (showErrorToast) {
      toast.error(errorMessage);
    }
    return {
      success: false,
      error: errorMessage,
    };
  }
};
