'use client';

import { ChevronRight } from 'lucide-react';
import { useEffect } from 'react';
import { tracker } from '@/analytics';
import Carousel from '@/shared-components/carousel';
import { MIXPANEL_EVENT_NAME, MIXPANEL_EVENT_TYPE } from '@/constants/enums';
import {
  useOnboardingScreenConfig,
  useOnboardingV2,
} from '@/features/onboarding/components/onboarding-v2-frame';
import { Testimonial, TESTIMONIALS } from '../config/onboarding';
import TestimonialCard from '../components/testimonial-cards';

const WelcomeScreen = () => {
  const { goTo } = useOnboardingV2();

  useEffect(() => {
    tracker.track({ name: MIXPANEL_EVENT_NAME.SCRIBEWEB_ONBOARD_WELCOME });
  }, []);

  const handleStartSetup = () => {
    tracker.track({
      name: MIXPANEL_EVENT_NAME.SCRIBEWEB_ONBOARD_WELCOME_CLICKS,
      type: MIXPANEL_EVENT_TYPE.SETUP,
    });
    goTo('preferences');
  };

  useOnboardingScreenConfig({
    currentStep: 1,
    totalSteps: 4,
    primaryAction: {
      label: 'Get started',
      onClick: handleStartSetup,
      icon: <ChevronRight className="size-4" />,
      subLabel: 'Takes less than a minute',
    },
  });

  return (
    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-8 md:gap-7">
      <section className="flex flex-col flex-1 min-w-0 md:max-w-[596px] 2xl:max-w-[720px] gap-8">
        <div className="border border-border rounded-lg overflow-hidden h-[260px] md:h-[326px] 2xl:h-[400px] w-full bg-secondary relative">
          <img
            src="https://cdn.eka.care/vagus/cmp0ta75g00060tf0ftzk4li5.png"
            alt="Person recording a session"
            className="absolute inset-0 w-full h-full object-cover"
          />
          <video
            src="/assets/onboarding-v2/patient-doc-visit_1.mp4"
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            className="absolute inset-0 w-full h-full object-cover"
          />
        </div>
        <div className="flex flex-col gap-4">
          <h1 className="text-3xl md:text-4xl 2xl:text-5xl leading-[1.1] tracking-[-0.025em] text-foreground">
            Less time on notes.
            <br />
            More time with patients.
          </h1>
          <p className="text-sm leading-5 text-[#767676] max-w-[347px]">
            Varta listens to your sessions and writes structured notes for you –
            automatically.
          </p>
        </div>
      </section>

      {TESTIMONIALS.length > 0 && (
        <aside className="hidden md:block w-[286px] 2xl:w-[340px] shrink-0">
          <Carousel<Testimonial>
            items={TESTIMONIALS}
            renderItem={(testimonial) => <TestimonialCard testimonial={testimonial} />}
            autoRotateMs={5000}
          />
        </aside>
      )}
    </div>
  );
};

export default WelcomeScreen;
