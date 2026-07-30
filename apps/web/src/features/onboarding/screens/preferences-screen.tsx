'use client';

import { ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { MIXPANEL_EVENT_NAME, MIXPANEL_EVENT_TYPE } from '@/constants/enums';
import { tracker } from '@/analytics';
import { SUPPORTED_SPECIALIZATIONS, SUPPORTED_LANGUAGES } from '@/constants/settings';
import { TPreferenceItem } from '@/constants/types';
import {
  useOnboardingScreenConfig,
  useOnboardingV2,
} from '@/features/onboarding/components/onboarding-v2-frame';
import {
  CustomSpecialtyDialog,
  PillSelectorQuestion,
} from '@/features/onboarding/components/preferences-pills';
import {
  MAX_LANGUAGES,
  MAX_SPECIALITIES,
  SUGGESTED_LANGUAGE_PILLS,
  SUGGESTED_SPECIALITY_PILLS,
} from '../config/onboarding';
import { updateOnboardingConfig } from '../utils/onboarding-api';

const PreferencesScreen = () => {
  const { goTo, data, setData } = useOnboardingV2();
  const [customDialogOpen, setCustomDialogOpen] = useState(false);

  useEffect(() => {
    tracker.track({ name: MIXPANEL_EVENT_NAME.SCRIBEWEB_ONBOARD_PERSONALIZE });
  }, []);

  const sortedSpecializations = useMemo(
    () => SUPPORTED_SPECIALIZATIONS.sort((a, b) => a.name.localeCompare(b.name)),
    []
  );

  const filteredLanguages = useMemo(
    () => SUPPORTED_LANGUAGES.filter((l) => l.id !== 'auto_detect'),
    []
  );

  const isValid = data.specialities.length > 0 && data.languages.length > 0;

  const handleNext = () => {
    if (!isValid) return;
    tracker.track({
      name: MIXPANEL_EVENT_NAME.SCRIBEWEB_ONBOARD_PERSONALIZE_CLICKS,
      type: MIXPANEL_EVENT_TYPE.SETUP,
    });

    updateOnboardingConfig({
      data: {
        specialization: data.specialities.map((s) => s.id).join(','),
        sys_info: { consult_language: data.languages.map((l) => l.id) },
      },
      showErrorToast: false,
    }).catch(() => {});

    goTo('setup-check');
  };

  const handleSkipStep = () => {
    tracker.track({
      name: MIXPANEL_EVENT_NAME.SCRIBEWEB_ONBOARD_PERSONALIZE_CLICKS,
      type: MIXPANEL_EVENT_TYPE.SKIP,
    });
    setData({ specialities: [], languages: [] });
    goTo('setup-check');
  };

  useOnboardingScreenConfig({
    currentStep: 2,
    totalSteps: 4,
    onBack: () => goTo('welcome'),
    primaryAction: {
      label: 'Next',
      onClick: handleNext,
      icon: <ChevronRight className="size-4" />,
      disabled: !isValid,
    },
    skipAction: { label: 'Skip step', onClick: handleSkipStep },
  });

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <h1 className="text-4xl md:text-5xl 2xl:text-6xl leading-[1.05] tracking-[-0.025em] text-foreground">
          Set your preferences
        </h1>
        <p className="text-sm leading-5 text-[#767676] max-w-[258px]">
          Helps generate notes in the right format and language from session one.
        </p>
      </div>

      <div className="flex flex-col gap-8">
        <PillSelectorQuestion
          number={1}
          title="What is your speciality?"
          hint={`(select upto ${MAX_SPECIALITIES})`}
          suggested={SUGGESTED_SPECIALITY_PILLS}
          allOptions={sortedSpecializations}
          selected={data.specialities}
          onChange={(items: TPreferenceItem[]) => setData({ specialities: items })}
          max={MAX_SPECIALITIES}
          searchPlaceholder="Search speciality..."
          emptyMessage="No speciality found."
          onSelectOther={() => setCustomDialogOpen(true)}
        />
        <CustomSpecialtyDialog
          open={customDialogOpen}
          onClose={() => setCustomDialogOpen(false)}
          onAdd={(name) => {
            const custom: TPreferenceItem = {
              id: `custom_${name.toLowerCase().replace(/\s+/g, '_')}`,
              name,
            };
            setData({ specialities: [...data.specialities, custom] });
          }}
        />

        <PillSelectorQuestion
          number={2}
          title="What languages do you usually consult in?"
          hint={`(select upto ${MAX_LANGUAGES})`}
          suggested={SUGGESTED_LANGUAGE_PILLS}
          allOptions={filteredLanguages}
          selected={data.languages}
          onChange={(items: TPreferenceItem[]) => setData({ languages: items })}
          max={MAX_LANGUAGES}
          searchPlaceholder="Search language..."
          emptyMessage="No language found."
        />
      </div>
    </div>
  );
};

export default PreferencesScreen;
