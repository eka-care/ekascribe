'use client';

import { Fragment, useState, useCallback, useRef, useEffect } from 'react';
import { Check, Loader2, AlertCircle } from 'lucide-react';
import ButtonWrapper from '@/shared-components/button/button-wrapper';
import {
  CustomTooltip,
  CustomTooltipTrigger,
  CustomTooltipContent,
} from '@/shared-components/custom-tooltip';
import type {
  TabFooterConfig,
  FooterButton,
  SaveStatusState,
} from '../../config/tab-footer-config';

const footerButtonClass = 'min-w-24 h-7 gap-1 px-2.5 rounded-lg text-sm whitespace-nowrap';

function SaveStatusIndicator({ status }: { status: SaveStatusState }) {
  if (status === 'generating') {
    return (
      <span className="flex items-center gap-1.5 text-sm text-[#2563eb]">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#2563eb]" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-[#2563eb]" />
        </span>
        Generating…
      </span>
    );
  }

  if (status === 'typing') {
    return (
      <span className="flex items-center gap-1 px-1.5 text-sm text-[#767676] opacity-50">
        <Loader2 className="w-4 h-4 animate-spin" />
        Saving
      </span>
    );
  }

  if (status === 'synced') {
    return (
      <span className="flex items-center gap-1 px-1.5 text-sm text-[#767676] opacity-50">
        <Check className="w-4 h-4" />
        Saved
      </span>
    );
  }

  if (status === 'error') {
    return (
      <span className="flex items-center gap-1 text-sm text-destructive">
        <AlertCircle className="w-4 h-4" />
        Failed to save
      </span>
    );
  }

  return null;
}

export function TabFooter({ config }: { config: TabFooterConfig }) {
  const [isCopied, setIsCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(copyTimerRef.current), []);

  const handleClick = useCallback((button: FooterButton) => {
    button.onClick();
    if (button.isCopyAction) {
      setIsCopied(true);
      clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setIsCopied(false), 5000);
    }
  }, []);

  const renderButton = (button: FooterButton) => {
    const isDisabled = button.disabled || (button.isCopyAction && isCopied);
    const label = button.isCopyAction && isCopied ? 'Copied' : button.label;

    if (button.buttonStyle === 'link') {
      const btn = (
        <button
          key={button.key}
          onClick={isDisabled ? undefined : () => handleClick(button)}
          disabled={isDisabled}
          className={`flex items-center justify-center ${footerButtonClass} font-medium border border-[#D1D1D1] bg-white cursor-pointer transition-colors ${
            isDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[#F5F5F5]'
          }`}
        >
          <span className="text-primary">{label}</span>
          {button.icon}
        </button>
      );

      if (isDisabled && button.disabledTooltip) {
        return (
          <CustomTooltip key={button.key}>
            <CustomTooltipTrigger asChild>{btn}</CustomTooltipTrigger>
            <CustomTooltipContent side="top" sideOffset={4}>
              {button.disabledTooltip}
            </CustomTooltipContent>
          </CustomTooltip>
        );
      }

      return btn;
    }

    const actionBtn = (
      <ButtonWrapper
        size="sm"
        variant={button.variant || 'default'}
        className={`${footerButtonClass} ${button.className || ''}`}
        onClick={() => handleClick(button)}
        disabled={isDisabled}
      >
        {label}
        {button.icon}
      </ButtonWrapper>
    );

    const tooltipText = isDisabled ? button.disabledTooltip : button.tooltip;
    if (tooltipText) {
      return (
        <CustomTooltip key={button.key}>
          <CustomTooltipTrigger asChild>
            {/* span keeps hover events alive when the button is disabled */}
            <span className="inline-flex">{actionBtn}</span>
          </CustomTooltipTrigger>
          <CustomTooltipContent side="top" sideOffset={4}>
            {tooltipText}
          </CustomTooltipContent>
        </CustomTooltip>
      );
    }

    return <Fragment key={button.key}>{actionBtn}</Fragment>;
  };

  const saveStatus = config.saveStatus && config.saveStatus !== 'idle' ? config.saveStatus : null;

  return (
    <div className="relative">
      {config.overlay}
      <div className="flex flex-col gap-1 p-4 bg-[#F5F5F5] border-t border-[#D1D1D1] shadow">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">{config.buttons.map(renderButton)}</div>

          {saveStatus && (
            <div className="flex items-center gap-2 shrink-0 ml-auto">
              <SaveStatusIndicator status={saveStatus} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
