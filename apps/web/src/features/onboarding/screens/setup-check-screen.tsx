'use client';

import { ChevronRight, ChevronsUpDown, Mic } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@ui/src';
import { toast } from 'sonner';
import { MIXPANEL_EVENT_NAME, MIXPANEL_EVENT_TYPE } from '@/constants/enums';
import { tracker } from '@/analytics';
import { useAudioInputDevices } from '@/features/onboarding/hooks/use-audio-input-devices';
import { useMicrophoneVisualizer } from '@/features/onboarding/hooks/use-microphone-visualizer';
import { useStaggeredSystemChecks } from '@/features/onboarding/hooks/use-staggered-system-checks';
import { useMicPermissionStatus } from '@/features/onboarding/hooks/use-mic-permission-status';
import {
  useOnboardingScreenConfig,
  useOnboardingV2,
} from '@/features/onboarding/components/onboarding-v2-frame';
import {
  MicPermissionToast,
  NumberedSection,
  SectionHeading,
  SystemCheckCard,
  VoiceBars,
} from '../components/setup-check-ui';

const BAR_COUNT = 11;
const FAILURE_TOAST_DELAY_MS = 500;

type Platform = 'windows' | 'mac' | 'other';

const detectPlatform = (): Platform => {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('win')) return 'windows';
  if (ua.includes('mac')) return 'mac';
  return 'other';
};

const isWebHost = () =>
  typeof window !== 'undefined' &&
  ['scribe.eka.care', 'scribe.dev.eka.care', 'localhost'].includes(window.location.hostname);

const SetupCheckScreen = () => {
  const { goTo, setData } = useOnboardingV2();

  const [platform, setPlatform] = useState<Platform>('other');
  const [devicePickerOpen, setDevicePickerOpen] = useState(false);

  useEffect(() => setPlatform(detectPlatform()), []);

  useEffect(() => {
    tracker.track({ name: MIXPANEL_EVENT_NAME.SCRIBEWEB_ONBOARD_SETUP });
  }, []);

  const showMicSection = platform !== 'windows';

  const {
    status: micStatus,
    isGranted: micGranted,
    requestPermission,
  } = useMicPermissionStatus({
    skip: platform === 'windows',
  });

  const { inputs, selectedDeviceId, setSelectedDeviceId } = useAudioInputDevices({
    enabled: micGranted && showMicSection,
  });

  const audioLevels = useMicrophoneVisualizer({
    enabled: micGranted && showMicSection,
    deviceId: selectedDeviceId,
    barCount: BAR_COUNT,
  });

  const { checks, allChecksDone, hasFailures, retryFailedChecks } = useStaggeredSystemChecks({
    start: true,
  });

  useEffect(() => {
    if (!allChecksDone || !hasFailures) return;
    let toastId: string | number | undefined;
    const timer = setTimeout(() => {
      toastId = toast.custom(
        (t) => (
          <MicPermissionToast
            title="Some checks didn't pass!"
            description="You can still continue — EkaScribe will work, but some features may be limited."
            onAction={() => retryFailedChecks()}
            onDismiss={() => toast.dismiss(t)}
          />
        ),
        { duration: Infinity }
      );
    }, FAILURE_TOAST_DELAY_MS);
    return () => {
      clearTimeout(timer);
      if (toastId !== undefined) toast.dismiss(toastId);
    };
  }, [allChecksDone, hasFailures, retryFailedChecks]);

  useEffect(() => {
    if (micStatus !== 'denied') return;
    const id = toast.custom(
      (t) => (
        <MicPermissionToast
          title="Mic access blocked"
          description="EkaScribe can't record without microphone access."
          onAction={micStatus !== 'denied' ? () => requestPermission() : undefined}
          onDismiss={() => toast.dismiss(t)}
        />
      ),
      { duration: Infinity }
    );
    return () => {
      toast.dismiss(id);
    };
  }, [micStatus, requestPermission]);

  const isReady = allChecksDone && (platform === 'windows' || micGranted);

  const handleNext = () => {
    if (!isReady) return;
    tracker.track({
      name: MIXPANEL_EVENT_NAME.SCRIBEWEB_ONBOARD_SETUP_CLICKS,
      type: MIXPANEL_EVENT_TYPE.SYSTEM_CHECKS,
    });
    setData({ microphonePermission: platform === 'windows' ? true : micGranted });
    goTo('complete');
  };

  const handleSkipStep = () => {
    tracker.track({
      name: MIXPANEL_EVENT_NAME.SCRIBEWEB_ONBOARD_SETUP_CLICKS,
      type: MIXPANEL_EVENT_TYPE.SKIP,
    });
    setData({ microphonePermission: false });
    goTo('complete');
  };

  useOnboardingScreenConfig({
    currentStep: 3,
    totalSteps: 4,
    onBack: () => goTo('preferences'),
    primaryAction: {
      label: 'Next',
      onClick: handleNext,
      icon: <ChevronRight className="size-4" />,
      disabled: !isReady,
    },
    skipAction: { label: 'Skip step', onClick: handleSkipStep },
  });

  const selectedDevice = inputs.find((d) => d.deviceId === selectedDeviceId);

  const micIllustrationSrc =
    !isWebHost() && platform === 'mac'
      ? 'https://cdn.eka.care/vagus/cmp0t6hl900030tf09urt5us0.png'
      : 'https://cdn.eka.care/vagus/cmp0t4mi700020tf0cjpr0aiz.png';

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-4xl md:text-5xl 2xl:text-6xl leading-[1.05] tracking-[-0.025em] text-foreground">
        Let&rsquo;s check your setup
      </h1>

      <div className={`grid grid-cols-1 gap-10 ${showMicSection ? 'md:grid-cols-2' : ''}`}>
        {showMicSection && (
          <NumberedSection number={1}>
            <SectionHeading
              title="Allow microphone permission"
              description="Microphone access is required to record consultations and generate transcriptions and documentation."
            />

            <div className="flex items-center gap-3">
              <Popover
                open={micGranted && devicePickerOpen}
                onOpenChange={(open) => micGranted && setDevicePickerOpen(open)}
              >
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    disabled={!micGranted || inputs.length === 0}
                    className="w-full sm:w-[281px] max-w-full flex items-center gap-2 px-2 py-1.5 rounded-lg border border-border bg-background text-xs leading-4 text-foreground disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <Mic className="size-4 shrink-0" />
                    <span
                      className={`flex-1 text-left truncate ${
                        selectedDevice ? 'text-foreground' : 'text-[#767676]'
                      }`}
                    >
                      {selectedDevice?.label || 'Select microphone'}
                    </span>
                    <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  className="w-(--radix-popover-trigger-width) p-1 border-border"
                  onWheel={(e) => e.stopPropagation()}
                >
                  {inputs.length === 0 ? (
                    <div className="py-2 px-3 text-xs text-[#767676]">No microphones</div>
                  ) : (
                    inputs.map((device) => (
                      <button
                        type="button"
                        key={device.deviceId}
                        onClick={() => {
                          setSelectedDeviceId(device.deviceId);
                          setDevicePickerOpen(false);
                        }}
                        className="w-full text-left px-3 py-2 text-sm rounded-md hover:bg-accent hover:text-accent-foreground cursor-pointer"
                      >
                        {device.label || 'Microphone'}
                      </button>
                    ))
                  )}
                </PopoverContent>
              </Popover>

              <VoiceBars levels={audioLevels} active={micGranted} />
            </div>

            <div
              className={`border border-border rounded-lg overflow-hidden w-full max-w-[420px] 2xl:max-w-[520px] aspect-[420/231] relative transition-opacity duration-300 ${
                micGranted ? 'opacity-50' : 'opacity-100'
              }`}
            >
              <img
                src={micIllustrationSrc}
                alt="Microphone permission prompt"
                className="absolute inset-0 w-full h-full object-cover"
              />
            </div>
          </NumberedSection>
        )}

        <NumberedSection number={showMicSection ? 2 : 1}>
          <SectionHeading
            title="Running background checks"
            description="Running a few quick checks to make sure EkaScribe works smoothly on your device."
          />
          <div className="flex flex-col gap-2 w-full max-w-[360px]">
            {checks.map((check) => (
              <SystemCheckCard key={check.id} check={check} />
            ))}
          </div>
        </NumberedSection>
      </div>
    </div>
  );
};

export default SetupCheckScreen;
