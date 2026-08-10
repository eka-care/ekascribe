'use client';

import { Button } from '@ui/src';
import { ChevronLeft, Loader2 } from 'lucide-react';
import Image from 'next/image';
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { TPreferenceItem } from '@/constants/types';

export type OnboardingV2Screen = 'welcome' | 'preferences' | 'setup-check' | 'complete';

export type OnboardingV2Data = {
  specialities: TPreferenceItem[];
  languages: TPreferenceItem[];
  microphonePermission: boolean;
};

export type OnboardingPrimaryAction = {
  label: string;
  onClick: () => void | Promise<void>;
  icon?: ReactNode;
  subLabel?: string;
  disabled?: boolean;
  loading?: boolean;
};

export type OnboardingSkipAction = {
  label?: string;
  onClick: () => void | Promise<void>;
};

export type OnboardingScreenConfig = {
  currentStep: number;
  totalSteps: number;
  primaryAction: OnboardingPrimaryAction;
  skipAction?: OnboardingSkipAction;
  onBack?: () => void | Promise<void>;
};

type Ctx = {
  screen: OnboardingV2Screen;
  goTo: (target: OnboardingV2Screen) => void;
  data: OnboardingV2Data;
  setData: (patch: Partial<OnboardingV2Data>) => void;
  resetData: () => void;
  screenConfig: OnboardingScreenConfig | null;
  setScreenConfig: (cfg: OnboardingScreenConfig | null) => void;
};

const EMPTY_DATA: OnboardingV2Data = {
  specialities: [],
  languages: [],
  microphonePermission: false,
};

const Context = createContext<Ctx | null>(null);

export const useOnboardingV2 = () => {
  const ctx = useContext(Context);
  if (!ctx) throw new Error('useOnboardingV2 must be used within <OnboardingV2Frame>');
  return ctx;
};

/**
 * Used by screens to push their header/footer config up to the frame.
 * Refs hold the latest handlers/icon so a screen re-render doesn't force
 * the frame to re-register (which would otherwise loop).
 */
export const useOnboardingScreenConfig = (cfg: OnboardingScreenConfig) => {
  const { setScreenConfig } = useOnboardingV2();

  const primaryActionRef = useRef(cfg.primaryAction);
  primaryActionRef.current = cfg.primaryAction;
  const skipActionRef = useRef(cfg.skipAction);
  skipActionRef.current = cfg.skipAction;
  const onBackRef = useRef(cfg.onBack);
  onBackRef.current = cfg.onBack;

  const { currentStep, totalSteps } = cfg;
  const { label, subLabel } = cfg.primaryAction;
  const disabled = cfg.primaryAction.disabled ?? false;
  const loading = cfg.primaryAction.loading ?? false;
  const skipLabel = cfg.skipAction?.label;
  const hasSkip = Boolean(cfg.skipAction);
  const hasBack = Boolean(cfg.onBack);

  useEffect(() => {
    setScreenConfig({
      currentStep,
      totalSteps,
      primaryAction: {
        label,
        icon: primaryActionRef.current.icon,
        subLabel,
        disabled,
        loading,
        onClick: () => primaryActionRef.current.onClick(),
      },
      skipAction: hasSkip
        ? { label: skipLabel, onClick: () => skipActionRef.current!.onClick() }
        : undefined,
      onBack: hasBack ? () => onBackRef.current!() : undefined,
    });
  }, [
    setScreenConfig,
    currentStep,
    totalSteps,
    label,
    subLabel,
    disabled,
    loading,
    skipLabel,
    hasSkip,
    hasBack,
  ]);

  useEffect(() => () => setScreenConfig(null), [setScreenConfig]);
};

type PendingAction = 'primary' | 'skip' | 'back' | null;
type SlideDirection = 'forward' | 'backward' | null;

const FrameInner = ({ children }: { children: ReactNode }) => {
  const { screenConfig } = useOnboardingV2();
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  const prevStepRef = useRef<number | null>(null);
  const [direction, setDirection] = useState<SlideDirection>(null);
  const [hasEntered, setHasEntered] = useState(true);
  const currentStep = screenConfig?.currentStep;

  useLayoutEffect(() => {
    if (currentStep === undefined || currentStep === null) return;
    const prev = prevStepRef.current;
    prevStepRef.current = currentStep;
    if (prev === null || prev === currentStep) return;
    setDirection(currentStep > prev ? 'forward' : 'backward');
    setHasEntered(false);
  }, [currentStep]);

  useEffect(() => {
    if (hasEntered) return;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setHasEntered(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [hasEntered]);

  useEffect(() => {
    if (hasEntered) return;
    const original = document.body.style.overflowX;
    document.body.style.overflowX = 'hidden';
    return () => {
      document.body.style.overflowX = original;
    };
  }, [hasEntered]);

  const isPrimaryLoading =
    pendingAction === 'primary' || (screenConfig?.primaryAction.loading ?? false);
  const isSkipLoading = pendingAction === 'skip';
  const isBackLoading = pendingAction === 'back';
  const isAnyLoading = isPrimaryLoading || isSkipLoading || isBackLoading;

  const handleBackClick = async () => {
    if (!screenConfig?.onBack || isAnyLoading) return;
    setPendingAction('back');
    try {
      await screenConfig.onBack();
    } finally {
      setPendingAction(null);
    }
  };

  const handlePrimaryClick = async () => {
    if (!screenConfig || isAnyLoading || screenConfig.primaryAction.disabled) return;
    setPendingAction('primary');
    try {
      await screenConfig.primaryAction.onClick();
    } finally {
      setPendingAction(null);
    }
  };

  const handleSkipClick = async () => {
    if (!screenConfig?.skipAction || isAnyLoading) return;
    setPendingAction('skip');
    try {
      await screenConfig.skipAction.onClick();
    } finally {
      setPendingAction(null);
    }
  };

  const transitionClass =
    direction === null || hasEntered
      ? 'transition-transform duration-500 ease-out'
      : 'transition-none';
  const transformClass = !hasEntered
    ? direction === 'forward'
      ? 'translate-x-full'
      : '-translate-x-full'
    : 'translate-x-0';

  const totalSteps = screenConfig?.totalSteps ?? 4;
  const displayStep = screenConfig?.currentStep ?? 1;

  return (
    <div className="bg-[#fcfcfc] h-dvh w-full flex flex-col overflow-y-hidden overflow-x-clip">
      <div className="flex-1 flex flex-col min-h-0 px-5 md:px-[10.55%] 2xl:px-16 2xl:max-w-7xl 2xl:mx-auto w-full pt-12">
        <header className="flex items-center justify-between gap-4 shrink-0">
          <Image
            src="/assets/eka-logo-desktop.svg"
            alt="varta"
            width={192}
            height={32}
            priority
            className="h-8 w-auto"
          />
          <div className="flex items-center gap-2">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <span
                key={i}
                className={`h-1 rounded-full transition-all duration-500 ease-out ${
                  i === displayStep - 1 ? 'bg-primary w-8' : 'bg-border w-4'
                }`}
              />
            ))}
          </div>
        </header>

        <main
          className={`flex-1 flex-start min-h-0 relative pt-12 md:pt-[64px] will-change-transform ${transitionClass} ${transformClass}`}
        >
          {screenConfig?.onBack && (
            <button
              type="button"
              onClick={handleBackClick}
              disabled={isAnyLoading}
              aria-label="Back"
              className="size-14 mb-2 flex items-center justify-center cursor-pointer text-[#767676] hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed md:absolute md:-left-14 md:top-[64px] md:ml-0 md:mb-0 z-10"
            >
              {isBackLoading ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <ChevronLeft className="size-5" color="#767676" />
              )}
            </button>
          )}
          <div className="h-full overflow-y-auto scrollbar-none pb-8">{children}</div>
        </main>
      </div>

      <footer className="shrink-0 flex flex-col items-start gap-1.5 px-5 md:px-[10.55%] 2xl:px-16 2xl:max-w-7xl 2xl:mx-auto w-full pb-8 pt-1 relative bg-white">
        <div
          aria-hidden
          className="absolute -top-12 left-0 right-0 h-12 pointer-events-none"
          style={{
            background: 'linear-gradient(0deg, #FFF 70%, rgba(255, 255, 255, 0.00) 100%)',
          }}
        />
        <div className="flex flex-col md:flex-row md:items-start gap-2 w-full md:w-auto">
          <Button
            onClick={handlePrimaryClick}
            disabled={(screenConfig?.primaryAction.disabled ?? true) || isAnyLoading}
            className="w-full md:w-60 h-10 rounded-lg cursor-pointer"
          >
            {screenConfig?.primaryAction.label ?? ''}
            {isPrimaryLoading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              screenConfig?.primaryAction.icon
            )}
          </Button>
          {screenConfig?.skipAction && (
            <Button
              variant="ghost"
              onClick={handleSkipClick}
              disabled={isAnyLoading}
              className="w-full md:w-auto h-10 px-3 cursor-pointer text-[#767676]"
            >
              {isSkipLoading && <Loader2 className="size-4 animate-spin mr-2" />}
              {screenConfig.skipAction.label ?? 'Skip onboarding'}
            </Button>
          )}
        </div>
        {screenConfig?.primaryAction.subLabel && (
          <p className="text-xs leading-4 text-[#767676] w-full md:w-60 text-center">
            {screenConfig.primaryAction.subLabel}
          </p>
        )}
      </footer>
    </div>
  );
};

export const OnboardingV2Frame = ({ children }: { children: ReactNode }) => {
  const [screen, setScreen] = useState<OnboardingV2Screen>('welcome');
  const [data, setDataState] = useState<OnboardingV2Data>(EMPTY_DATA);
  const [screenConfig, setScreenConfig] = useState<OnboardingScreenConfig | null>(null);

  const goTo = useCallback((target: OnboardingV2Screen) => setScreen(target), []);
  const setData = useCallback(
    (patch: Partial<OnboardingV2Data>) => setDataState((prev) => ({ ...prev, ...patch })),
    []
  );
  const resetData = useCallback(() => setDataState(EMPTY_DATA), []);

  const value = useMemo<Ctx>(
    () => ({ screen, goTo, data, setData, resetData, screenConfig, setScreenConfig }),
    [screen, goTo, data, setData, resetData, screenConfig]
  );

  return (
    <Context.Provider value={value}>
      <FrameInner>{children}</FrameInner>
    </Context.Provider>
  );
};
