'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  OnboardingV2Frame,
  useOnboardingV2,
} from '@/features/onboarding/components/onboarding-v2-frame';
import WelcomeScreen from '@/features/onboarding/screens/welcome-screen';
import PreferencesScreen from '@/features/onboarding/screens/preferences-screen';
import SetupCheckScreen from '@/features/onboarding/screens/setup-check-screen';
import CompleteScreen from '@/features/onboarding/screens/complete-screen';
import useGetEkascribeConfig from '@/features/settings/hooks/use-get-config';
import { updateOnboardingConfig } from '@/features/onboarding/utils/onboarding-api';
import { ONBOARDING_STEP } from '@/constants/enums';
import useVoice2RxStore from '@/store/store';
import { FEATURES } from '@/config/features';

const Screens = () => {
  const { screen } = useOnboardingV2();
  if (screen === 'welcome') return <WelcomeScreen />;
  if (screen === 'preferences') return <PreferencesScreen />;
  if (screen === 'setup-check') return <SetupCheckScreen />;
  return <CompleteScreen />;
};

/**
 * Entry gate for onboarding-v2.
 *
 * Server-side `onboarding_step` is the only source of truth. We capture the
 * value on first non-loading render (before any side-effect mutates it) and
 * decide once:
 *
 *   - null/undefined → first-time user → POST `onboarding_started`, render flow.
 *   - 'onboarding_started' → user previously entered the flow and left
 *     (refresh / nav-away / logout/relogin) → POST `onboarding_completed`
 *     and silently redirect to /new-session.
 *   - anything else → already completed → silently redirect to /new-session.
 *
 * In-memory progress is intentionally lost on refresh — the gate makes sure
 * the user never sees onboarding twice.
 */
const OnboardingGate = ({ children }: { children: React.ReactNode }) => {
  const router = useRouter();
  // Feature-flagged off by default for on-prem (plan decision #8): skip
  // onboarding entirely and land on a new session.
  useEffect(() => {
    if (!FEATURES.onboarding) router.replace('/new-session');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!FEATURES.onboarding) return null;
  const searchParams = useSearchParams();
  const { data: config, isLoading } = useGetEkascribeConfig();
  const setOnboardingState = useVoice2RxStore((state) => state.setOnboardingState);

  // Capture once, on the first render where config is available. Any later
  // mutation (e.g. our own POSTs) refreshes the cache but won't reopen the
  // decision.
  const initialStepRef = useRef<ONBOARDING_STEP | null | undefined>(undefined);
  const [shouldRender, setShouldRender] = useState(false);

  if (initialStepRef.current === undefined && !isLoading && config) {
    initialStepRef.current = (config.onboarding_step as ONBOARDING_STEP) ?? null;
  }

  useEffect(() => {
    const initial = initialStepRef.current;
    if (initial === undefined) return;

    if (initial === null) {
      // First-time visitor: mark started in the background, render the flow.
      // Mirror into the store so the protected-route-provider sees the right
      // state immediately and doesn't fight us on routing.
      let queryString = searchParams.toString();

      if (!queryString && typeof window !== 'undefined') {
        queryString = new URLSearchParams(window.location.search).toString();
      }
      setOnboardingState(ONBOARDING_STEP.ONBOARDING_STARTED);
      updateOnboardingConfig({
        data: { onboarding_step: ONBOARDING_STEP.ONBOARDING_STARTED },
        query_params: queryString.toString(),
        showErrorToast: false,
      }).catch(() => {});
      setShouldRender(true);
      return;
    }

    if (initial === ONBOARDING_STEP.ONBOARDING_STARTED) {
      // User left the flow before. Mark completed synchronously in the store
      // so the provider on /new-session sees COMPLETED and doesn't bounce
      // them back. Fire the server save in the background.
      setOnboardingState(ONBOARDING_STEP.ONBOARDING_COMPLETED);
      updateOnboardingConfig({
        data: { onboarding_step: ONBOARDING_STEP.ONBOARDING_COMPLETED },
        showErrorToast: false,
      }).catch(() => {});
      router.replace('/new-session');
      return;
    }

    // Already completed (or any other terminal value) — exit silently.
    router.replace('/new-session');
  }, [isLoading, config, router, setOnboardingState]);

  if (!shouldRender) return null;
  return <>{children}</>;
};

const OnboardingV2Page = () => (
  <OnboardingGate>
    <OnboardingV2Frame>
      <Screens />
    </OnboardingV2Frame>
  </OnboardingGate>
);

export default OnboardingV2Page;
