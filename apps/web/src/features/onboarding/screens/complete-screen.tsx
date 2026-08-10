'use client';

import { ChevronRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import useVoice2RxStore from '@/store/store';
import { MIXPANEL_EVENT_NAME, MIXPANEL_EVENT_TYPE, ONBOARDING_STEP } from '@/constants/enums';
import { tracker } from '@/analytics';
import {
  useOnboardingScreenConfig,
  useOnboardingV2,
} from '@/features/onboarding/components/onboarding-v2-frame';
import { updateOnboardingConfig } from '@/features/onboarding/utils/onboarding-api';
import { FUTURE_STEPS } from '../config/onboarding';

const NEXT_ROUTE = '/new-session';

const CompleteScreen = () => {
  const router = useRouter();
  const { resetData } = useOnboardingV2();
  const loggedInUserDetails = useVoice2RxStore((state) => state.loggedInUserDetails);
  const setOnboardingState = useVoice2RxStore((state) => state.setOnboardingState);

  useEffect(() => {
    tracker.track({ name: MIXPANEL_EVENT_NAME.SCRIBEWEB_ONBOARD_COMPLETE });
  }, []);

  const salutation = loggedInUserDetails?.s?.trim();
  const firstName = loggedInUserDetails?.fn?.trim();
  const doctorName = [salutation, firstName].filter(Boolean).join(' ');
  const illustrationSrc =
    loggedInUserDetails?.gen === 'F'
      ? 'https://cdn.eka.care/vagus/cmp15agie00030tdmdzc8az3k.png'
      : 'https://cdn.eka.care/vagus/cmp0snk6n00000tf0fiwdch2t.png';

  const handleStart = () => {
    tracker.track({
      name: MIXPANEL_EVENT_NAME.SCRIBEWEB_ONBOARD_COMPLETE_CLICKS,
      type: MIXPANEL_EVENT_TYPE.START_NEW_SESSION,
    });
    setOnboardingState(ONBOARDING_STEP.ONBOARDING_COMPLETED);
    updateOnboardingConfig({
      data: { onboarding_step: ONBOARDING_STEP.ONBOARDING_COMPLETED },
      showErrorToast: false,
    }).catch(() => {});
    resetData();
    router.replace(`${NEXT_ROUTE}?autostart=1`);
  };

  useOnboardingScreenConfig({
    currentStep: 4,
    totalSteps: 4,
    primaryAction: {
      label: 'Record my first session',
      onClick: handleStart,
      icon: <ChevronRight className="size-4" />,
    },
  });

  return (
    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-8 md:gap-7">
      <section className="flex flex-col flex-1 min-w-0 md:max-w-[596px] 2xl:max-w-[720px] gap-8">
        <div className="border border-border rounded-lg overflow-hidden h-[260px] md:h-[326px] 2xl:h-[400px] w-full bg-secondary relative">
          <img
            src={illustrationSrc}
            alt="Person giving a thumbs up"
            className="absolute inset-0 w-full h-full object-cover"
          />
        </div>
        <div className="flex flex-col gap-4">
          <h1 className="text-3xl md:text-4xl 2xl:text-5xl leading-[1.1] tracking-[-0.025em] text-foreground">
            Congratulations 🎉{doctorName ? `, ${doctorName}` : ''}!
            <br />
            You&rsquo;re all set to go!
          </h1>
          <p className="text-sm leading-5 text-[#767676] max-w-[420px]">
            Your setup is complete. Start using Varta to record sessions and generate
            clinical notes with ease.
          </p>
        </div>
      </section>

      <aside className="bg-secondary rounded-lg p-4 flex flex-col gap-4 w-full md:w-[332px] shrink-0">
        <div className="flex flex-col gap-2 w-full">
          <span className="self-start inline-flex items-center justify-center px-1 rounded bg-gradient-to-t from-[#2050b0] to-[#6087d6] text-[10px] leading-4 font-semibold uppercase tracking-[0.08em] text-[#ecfdf4]">
            takes approx 5 minutes
          </span>
          <p className="text-lg leading-none font-medium text-foreground">
            Get more out of Varta
          </p>
          <p className="text-xs leading-4 text-[#767676]">
            No rush – you can complete these whenever you wish to. Each step unlocks a feature or
            improves your notes on Varta.
          </p>
        </div>
        <ol className="flex flex-col gap-2 w-full">
          {FUTURE_STEPS.map((step) => (
            <li
              key={step.number}
              className="bg-muted rounded-lg px-3 py-3 flex gap-2 items-start w-full"
            >
              <span
                aria-hidden
                className="inline-flex items-center justify-center size-5 rounded-xl bg-border text-primary text-xs font-medium leading-4 shrink-0"
              >
                {step.number}
              </span>
              <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                <p className="text-sm leading-5 font-medium text-foreground">{step.title}</p>
                <p className="text-xs leading-4 text-[#767676]">{step.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
};

export default CompleteScreen;
