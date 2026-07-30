'use client';

import { useState } from 'react';
import { Check, Hourglass, Loader2, RotateCcw, TriangleAlert, X } from 'lucide-react';
import type { CheckStatus, SystemCheckItem } from '../hooks/use-staggered-system-checks';

const WARNING_DARK = '#b45309';
const WARNING_LIGHT = '#fff3cd';

export const SectionHeading = ({ title, description }: { title: string; description: string }) => (
  <div className="flex flex-col gap-1 max-w-[310px]">
    <p className="text-base leading-6 font-medium text-foreground">{title}</p>
    <p className="text-sm leading-5 text-[#767676]">{description}</p>
  </div>
);

export const NumberedSection = ({
  number,
  children,
}: {
  number: number;
  children: React.ReactNode;
}) => (
  <div className="flex gap-2 items-start">
    <span
      aria-hidden
      className="inline-flex items-center justify-center size-5 rounded-xl bg-accent text-primary text-xs font-medium leading-4 shrink-0 mt-0.5"
    >
      {number}
    </span>
    <div className="flex flex-col gap-6 flex-1 min-w-0">{children}</div>
  </div>
);

const CheckStatusIcon = ({ status }: { status: CheckStatus }) => {
  switch (status) {
    case 'passed':
      return <Check className="size-4 text-green-600 shrink-0" strokeWidth={2.5} />;
    case 'running':
      return <Loader2 className="size-4 text-[#215fff] shrink-0 animate-spin" />;
    case 'failed':
      return <TriangleAlert className="size-4 text-[#B45309] shrink-0" strokeWidth={2} />;
    case 'pending':
    default:
      return <Hourglass className="size-4 text-[#767676] shrink-0" />;
  }
};

export const SystemCheckCard = ({ check }: { check: SystemCheckItem }) => {
  const cardStyle = {
    pending: 'bg-muted opacity-50',
    running: 'bg-[#e9efff]',
    passed: 'bg-[#ecfdf4]',
    failed: 'bg-[#FFF3CD]',
  }[check.status];

  return (
    <div className={`flex gap-4 items-center px-3 py-3 rounded-lg w-full ${cardStyle}`}>
      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
        <p className="text-sm leading-5 font-medium text-foreground truncate">{check.title}</p>
        <p className="text-xs leading-4 text-[#767676] truncate">
          {check.descriptions[check.status]}
        </p>
      </div>
      <CheckStatusIcon status={check.status} />
    </div>
  );
};

export const VoiceBars = ({ levels, active }: { levels: number[]; active: boolean }) => (
  <div className={`flex items-center gap-[3px] shrink-0 ${active ? '' : 'opacity-50'}`} aria-hidden>
    {levels.map((level, i) => (
      <div
        key={i}
        className={`w-[3px] shrink-0 rounded transition-all duration-100 ${
          active && level > 0.05 ? 'bg-[#039855]' : 'bg-[#d9d9d9]'
        }`}
        style={{ height: '16px' }}
      />
    ))}
  </div>
);

export const MicPermissionToast = ({
  title,
  description,
  onAction,
  onDismiss,
}: {
  title: string;
  description: string;
  onAction?: () => void;
  onDismiss: () => void;
}) => {
  const [clickCount, setClickCount] = useState(0);

  const handleAction = () => {
    setClickCount((c) => c + 1);
    onAction?.();
  };

  return (
    <div
      role="alert"
      style={{ backgroundColor: WARNING_LIGHT, borderColor: WARNING_DARK, color: WARNING_DARK }}
      className="relative flex w-full items-center gap-4 rounded-lg border p-4 shadow-md"
    >
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        style={{ backgroundColor: WARNING_LIGHT, borderColor: WARNING_DARK, color: WARNING_DARK }}
        className="absolute -right-[11px] -top-[11px] flex size-5 items-center justify-center rounded-full border cursor-pointer hover:opacity-90"
      >
        <X className="size-3" />
      </button>
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <p className="text-base leading-6 font-medium truncate">{title}</p>
        <p className="text-sm leading-5 opacity-70">{description}</p>
      </div>
      {onAction && (
        <button
          type="button"
          onClick={handleAction}
          style={{ backgroundColor: WARNING_DARK }}
          className="shrink-0 inline-flex items-center justify-center min-w-16 rounded-lg text-white text-sm leading-6 font-medium px-1.5 py-0.5 cursor-pointer hover:opacity-90"
        >
          <RotateCcw
            className="size-4 transition-transform duration-500 ease-in-out"
            style={{ transform: `rotate(${clickCount * -360}deg)` }}
          />
          <span className="px-1">Try again</span>
        </button>
      )}
    </div>
  );
};
