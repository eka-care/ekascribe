'use client';

import { useEffect } from 'react';
import useVoice2RxStore from '@/store/store';
import useGetEkascribeConfig from '@/features/settings/hooks/use-get-config';
import { ONBOARDING_STEP } from '@/constants/enums';

const useOnboardingManager = () => {
  const { data: ekascribeConfig, isLoading: isLoadingConfig } = useGetEkascribeConfig();
  const onboardingState = useVoice2RxStore((state) => state.onboarding_state);
  const setOnboardingState = useVoice2RxStore((state) => state.setOnboardingState);

  useEffect(() => {
    if (isLoadingConfig || !ekascribeConfig) return;
    if (onboardingState) return;

    const apiOnboardingStep = ekascribeConfig.onboarding_step;
    setOnboardingState(apiOnboardingStep as ONBOARDING_STEP);
  }, [ekascribeConfig, isLoadingConfig, onboardingState, setOnboardingState]);

  const needsStoreSync = !isLoadingConfig && !!ekascribeConfig?.onboarding_step && !onboardingState;

  return {
    onboarding_step: onboardingState,
    isLoading: isLoadingConfig || needsStoreSync,
  };
};

export default useOnboardingManager;
