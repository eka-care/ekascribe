'use client';

import { useState } from 'react';
import { Button } from '@ui/src';
import { X, Check } from 'lucide-react';
const TOTAL_STEPS = 5;
const COMPLETED_STEPS = 1;

interface CardItem {
  icon: string;
  title: string;
  subtitle: string;
  buttonLabel: string;
  isActive?: boolean;
}

const CARD_ITEMS: CardItem[] = [
  {
    icon: '/images/use-ekascribe-banner/icon-web.svg',
    title: 'Scribe Web',
    subtitle: 'Use on your web browser',
    buttonLabel: 'Using now',
    isActive: true,
  },
  {
    icon: '/images/use-ekascribe-banner/icon-mobile.svg',
    title: 'iOS / Android app',
    subtitle: 'Record on the go',
    buttonLabel: 'Get',
  },
  {
    icon: '/images/use-ekascribe-banner/icon-chrome.svg',
    title: 'Chrome extension',
    subtitle: 'Use alongwith your EMR',
    buttonLabel: 'Get',
  },
  {
    icon: '/images/use-ekascribe-banner/icon-windows.svg',
    title: 'Windows app',
    subtitle: 'Native desktop client',
    buttonLabel: 'Get',
  },
  {
    icon: '/images/use-ekascribe-banner/icon-whatsapp.svg',
    title: 'WhatsApp',
    subtitle: 'Varta inside WhatsApp',
    buttonLabel: 'Connect',
  },
];

const UseEkascribeBanner = () => {
  const [isVisible, setIsVisible] = useState(true);

  if (!isVisible) return null;

  return (
    <div
      className="absolute z-50 shadow-lg bg-white rounded-lg border border-[#D1D1D1] py-4 flex flex-col gap-4"
      style={{
        width: 320,
        top: 16,
        right: 16,
      }}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-4 px-4">
        <div className="flex flex-col gap-1">
          <p className="text-foreground font-semibold text-base leading-6">
            Use Varta
            <br />
            everywhere you consult
          </p>
          <p className="text-muted-foreground font-normal text-xs leading-4">
            Install once, scribe from anywhere
          </p>
        </div>
        <Button
          variant="ghost"
          onClick={() => setIsVisible(false)}
          className="w-5 h-5 cursor-pointer flex items-center justify-center opacity-80"
        >
          <X size={16} />
        </Button>
      </div>

      {/* Progress bar + counter */}
      <div className="flex flex-col gap-2 px-4">
        <div className="flex gap-1 shrink-0">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i < COMPLETED_STEPS ? 'bg-primary' : 'bg-neutral-300'
              }`}
            />
          ))}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-foreground font-semibold text-xs leading-4">
            {COMPLETED_STEPS} of {TOTAL_STEPS}
          </span>
          <span className="text-muted-foreground font-normal text-xs leading-4">done</span>
        </div>
      </div>

      {/* Divider */}
      <div className="w-full border-t border-[#D1D1D1] opacity-40" />

      {/* Card items */}
      <div className="flex flex-col gap-3 px-4">
        {CARD_ITEMS.map((item) => (
          <div key={item.title} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <img src={item.icon} alt={item.title} width={20} height={20} className="shrink-0" />
              <div className="flex flex-col min-w-0">
                <span className="text-foreground font-normal text-sm leading-5 truncate">
                  {item.title}
                </span>
                <span className="text-muted-foreground font-normal text-xs leading-4 truncate">
                  {item.subtitle}
                </span>
              </div>
            </div>

            {item.isActive ? (
              <div className="flex items-center gap-1 opacity-50 shrink-0">
                <Check className="w-4 h-4 text-primary" />
                <span className="text-primary font-medium text-sm leading-6">Using now</span>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 cursor-pointer py-0.5 h-7 text-primary"
              >
                {item.buttonLabel}
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default UseEkascribeBanner;
