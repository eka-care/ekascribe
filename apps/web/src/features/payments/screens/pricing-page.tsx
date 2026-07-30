'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import EkaLogoDesktop from '../../../../public/assets/eka-logo-desktop.svg';
import { RefreshCcw, X } from 'lucide-react';
import { Button, Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@ui/src';
import { useRouter, useSearchParams } from 'next/navigation';
import { TPricingCardProps } from '@/constants/types';
import PricingCard from '../components/pricing-card';
import { getPricingByRegion, TPricing } from '@/utils/geolocation';
import useVoice2RxStore from '@/store/store';
import { refreshToken } from '@/fetch-client';
import { MIXPANEL_EVENT_NAME, MIXPANEL_EVENT_TYPE } from '@/constants/enums';
import { tracker } from '@/analytics';
import { toast } from 'sonner';
import { useSystem } from '@/platform';

const PricingPage = () => {
  const system = useSystem();
  const searchParams = useSearchParams();
  const planParam = searchParams.get('plan');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>(
    planParam === 'yearly' ? 'yearly' : 'monthly'
  );
  const regionInfo = useVoice2RxStore((state) => state.userRegion);
  const router = useRouter();
  const loggedInUserDetails = useVoice2RxStore((state) => state.loggedInUserDetails);
  const refreshLoggedInUserDetailsPromise = useVoice2RxStore(
    (state) => state.refreshLoggedInUserDetailsPromise
  );
  const [pricing, setPricing] = useState<TPricing>({
    monthly: {
      price: '₹1,499',
      rawPrice: 1499,
      currency: 'INR',
      symbol: '₹',
      link: 'https://buy.stripe.com/7sYfZj8t46BnfTvgG67ss00',
    },
    yearly: {
      price: '₹14,990',
      rawPrice: 14990,
      currency: 'INR',
      symbol: '₹',
      link: 'https://buy.stripe.com/bJecN7eRs4tffTvgG67ss01',
    },
    region: 'India',
  });
  const setBannerInfo = useVoice2RxStore((state) => state.setBannerInfo);

  const SHOW_PRICING = true;

  useEffect(() => {
    let regionalPricing;
    if (regionInfo) {
      regionalPricing = getPricingByRegion(regionInfo?.isIndia);
    } else {
      regionalPricing = getPricingByRegion(true);
    }
    setPricing(regionalPricing);
  }, [regionInfo]);

  const handleCheckBannerStatus = async () => {
    const isRefreshed = await refreshToken();

    if (isRefreshed) {
      await refreshLoggedInUserDetailsPromise?.();

      if (!loggedInUserDetails?.is_paid_doc) {
        toast.info(
          'No payment found at the moment. If you’ve made a payment, please try again later.',
          {
            style: {
              marginTop: '28px',
            },
          }
        );
      }
    }
  };

  const handleGetPro = () => {
    if (billingCycle === 'monthly') {
      tracker.track({
        name: MIXPANEL_EVENT_NAME.SCRIBEWEB_PRICING_PLAN_TYPE,
        type: MIXPANEL_EVENT_TYPE.PRO_MONTHLY,
      });
    } else {
      tracker.track({
        name: MIXPANEL_EVENT_NAME.SCRIBEWEB_PRICING_PLAN_TYPE,
        type: MIXPANEL_EVENT_TYPE.PRO_YEARLY,
      });
    }

    const redirectUrl = billingCycle === 'monthly' ? pricing.monthly.link : pricing.yearly.link;
    const finalRedirectUrl = `${redirectUrl}?client_reference_id=${loggedInUserDetails?.uuid}__${loggedInUserDetails?.['b-id']}`;
    system?.openExternal(finalRedirectUrl);

    setBannerInfo({
      title: 'Problem with your payment?',
      subtitle: 'Click to check your subscription status.',
      bannerTimeout: 5 * 60 * 1000,
      showForAllUsers: false,
      ActionComponent: () => {
        return (
          <Button onClick={handleCheckBannerStatus} className="cursor-pointer">
            <RefreshCcw className="w-4 h-4" />
            Check Status
          </Button>
        );
      },
    });
  };

  const handleContactSupport = () => {
    tracker.track({
      name: MIXPANEL_EVENT_NAME.SCRIBEWEB_PRICING_PLAN_TYPE,
      type: MIXPANEL_EVENT_TYPE.CONTACT_US,
    });
    system?.openExternal(
      'https://calendly.com/eka-care-session/explore-eka-scribe-all-in-one-doctors-tool'
    );
  };

  // Pricing cards data
  const pricingCards: TPricingCardProps[] = [
    {
      id: 'free',
      name: 'Free',
      badge: 'Current Default Plan',
      badgeVariant: 'secondary' as const,
      description: 'Perfect for getting started',
      price: null,
      buttonText: 'Current Plan',
      buttonVariant: 'outline' as const,
      buttonDisabled: true,
      buttonAction: () => {},
      features: [
        {
          label: '5 Free Sessions Every Day',
        },
        {
          label: 'Record in Your Preferred Mode',
        },
        {
          label: 'Choose Your Preferred AI Model',
          subfeatures: ['Pro: Precision prioritized over pace', 'Lite: Faster, balanced accuracy'],
        },
        {
          label: 'Access the Eka Template Directory',
        },
        {
          label: 'Choose from 20+ Languages',
        },
        {
          label: 'Upload Audio Clips',
        },
      ],
      isPopular: false,
      cardStyle: { minHeight: '380px' },
      cardClassName: 'border border-border rounded-lg py-3',
    },
    {
      id: 'pro',
      name: 'Pro',
      badge: 'Most Popular',
      badgeVariant: 'default' as const,
      description: 'For growing practices',
      price: pricing,
      buttonText: 'Subscribe to Pro',
      buttonVariant: 'default' as const,
      buttonDisabled: false,
      buttonAction: handleGetPro,
      features: [
        {
          label: 'Unlimited Sessions Every Day',
        },
        {
          label: 'Premium Chat Support',
        },
      ],
      isPopular: true,
      cardStyle: { minHeight: '380px' },
      cardClassName: 'relative border-2 border-primary rounded-lg shadow-lg transform scale-105',
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      badge: null,
      badgeVariant: null,
      description: 'Tailored for large organizations',
      price: null,
      buttonText: 'Contact Us',
      buttonVariant: 'outline' as const,
      buttonDisabled: false,
      buttonAction: handleContactSupport,
      features: [
        {
          label: 'Custom Limits',
        },
        {
          label: 'Priority support',
        },
        {
          label: 'Custom integrations',
        },
        {
          label: 'Dedicated account manager',
        },
      ],
      isPopular: false,
      cardStyle: { minHeight: '380px' },
      cardClassName: 'border border-border rounded-lg',
    },
  ];

  // FAQ data
  const faqData = [
    {
      question: 'How does the free plan work?',
      answer:
        'You get 5 free transcription sessions per day. Each session can record and transcribe your medical consultations into structured notes. No credit card required.',
    },
    {
      question: 'Is my data secure?',
      answer:
        'Absolutely. We never store your audio recordings. All transcription is processed securely and your data is encrypted in transit and at rest.',
    },
    {
      question: 'Can I cancel anytime?',
      answer:
        "Yes, you can cancel your Pro subscription at any time. You'll continue to have access to Pro features until the end of your billing period.",
    },
    {
      question: 'What languages are supported?',
      answer:
        'We currently support more than 20+ languages. Our AI is trained specifically for medical terminology and context.',
    },
    {
      question: 'How accurate is the transcription?',
      answer:
        'Our medical-grade AI achieves over 95% accuracy for medical transcriptions. The system is specifically trained on medical terminology and clinical conversations.',
    },
    {
      question: 'Can I use this on mobile devices?',
      answer:
        'Yes! EkaScribe works seamlessly on all devices - desktop, tablet, and mobile. You can access your notes from anywhere.',
    },
    {
      question: 'Do you offer team discounts?',
      answer:
        'Yes, we offer special pricing for larger practices and healthcare organizations. Contact our enterprise team for custom pricing.',
    },
  ];

  const yearlyDiscount = Math.round(
    (1 - pricing.yearly.rawPrice / (pricing.monthly.rawPrice * 12)) * 100
  );

  return (
    <div className="min-h-screen bg-background py-4 md:py-8 px-4 w-full">
      <div className="max-w-6xl mx-auto space-y-12">
        {/* Header */}
        <div className="text-center flex flex-col items-center justify-center space-y-3">
          <div className="flex justify-between w-full items-center">
            <Image src={EkaLogoDesktop} alt="EkaScribe" width={111} height={32} />
            <Button
              variant="ghost"
              size="sm"
              className="cursor-pointer"
              onClick={() => {
                router.push('/new-session');
              }}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
          <p className="text-2xl md:text-3xl font-bold leading-6">
            Choose the perfect plan for your practice
          </p>
          <p className="text-base text-secondary-foreground max-w-2xl mx-auto">
            Transform your medical documentation with AI-powered EkaScribe.
          </p>

          {SHOW_PRICING && (
            <div className="flex justify-center">
              <div className="inline-flex bg-secondary rounded-full p-1">
                <button
                  onClick={() => setBillingCycle('monthly')}
                  className={`px-4 py-2 text-sm font-medium transition-all duration-200 rounded-full ${
                    billingCycle === 'monthly'
                      ? 'bg-white text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Monthly
                </button>
                <button
                  onClick={() => setBillingCycle('yearly')}
                  className={`px-4 py-2 text-sm font-medium transition-all duration-200 rounded-full ${
                    billingCycle === 'yearly'
                      ? 'bg-white text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <span>Yearly</span>
                    <span className="text-[10px] text-green-10 font-bold leading-none">
                      Save {yearlyDiscount}%
                    </span>
                  </div>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-4 max-w-4xl mx-auto place-items-center md:place-items-stretch">
          {pricingCards.map((card) => {
            return (
              <PricingCard
                key={card.id}
                card={card}
                billingCycle={billingCycle}
                setBillingCycle={setBillingCycle}
                showPricing={SHOW_PRICING}
                yearlyDiscount={yearlyDiscount}
              />
            );
          })}
        </div>

        {/* FAQ Section */}
        <div className="mt-15 max-w-4xl mx-auto flex flex-col space-y-2">
          <div className="text-center flex flex-col space-y-2">
            <p className="text-xl md:text-2xl font-bold">Frequently Asked Questions</p>
            <p className="text-sm md:text-base text-muted-foreground">
              Answers to common questions from doctors and healthcare professionals.
            </p>
          </div>

          <Accordion type="single" collapsible className="w-full">
            {faqData.map((faq, index) => (
              <AccordionItem key={index} value={`item-${index}`}>
                <AccordionTrigger className="text-left font-medium text-base hover:no-underline">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground leading-relaxed">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </div>
  );
};

export default PricingPage;
