'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Bookmark, Check, Loader2, AlertCircle } from 'lucide-react';
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
      <span className="flex items-center gap-1 text-sm text-secondary-foreground">
        <Loader2 className="w-3 h-3 animate-spin" />
        Saving...
      </span>
    );
  }

  if (status === 'synced') {
    return (
      <span className="flex gap-1 items-center text-sm text-green-10">
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

export function TabFooter({ config, sessionId }: { config: TabFooterConfig; sessionId: string }) {
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
          className={`flex items-center gap-1.5 px-1.5 py-0.5 text-sm font-medium rounded-lg border border-[#D1D1D1] bg-white cursor-pointer transition-colors ${
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

    return (
      <ButtonWrapper
        key={button.key}
        size="sm"
        variant={button.variant || 'default'}
        className={`gap-1.5 px-3 h-7 text-sm whitespace-nowrap ${button.className || ''}`}
        onClick={() => handleClick(button)}
        disabled={isDisabled}
      >
        {label}
        {button.icon}
      </ButtonWrapper>
    );
  };

  const showStatusCluster = !!(config.saveStatus && config.saveStatus !== 'idle');

  return (
    <div className="relative">
      {config.overlay}
      <div className="flex flex-col p-3 space-y-1 bg-[#F5F5F5] border-t border-[#D1D1D1] shadow">
        {/* Desktop: single row (buttons left, status right).
            Mobile: status moves to its own row above, buttons below. */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
          <div className="flex items-center gap-2">{config.buttons.map(renderButton)}</div>

          {showStatusCluster && (
            <div className="order-first sm:order-none w-full sm:w-auto sm:ml-auto flex items-center justify-end gap-2">
              <SaveStatusIndicator status={config.saveStatus!} />
            </div>
          )}

          {(config.saveNote || config.publish) && (
            <div
              className={`flex items-center gap-2 shrink-0 ml-auto ${
                showStatusCluster ? 'sm:ml-0' : 'sm:ml-auto'
              }`}
            >
              {config.saveNote && (
                <button
                  type="button"
                  onClick={config.saveNote.isNoteSaved ? undefined : config.saveNote.onSaveNote}
                  disabled={config.saveNote.isNoteSaved}
                  className={`flex items-center gap-1.5 px-3 h-7 text-sm rounded-lg border border-[#D1D1D1] bg-white whitespace-nowrap transition-colors ${
                    config.saveNote.isNoteSaved
                      ? 'text-primary opacity-70 cursor-default'
                      : 'text-primary hover:bg-[#F5F5F5] cursor-pointer'
                  }`}
                >
                  {config.saveNote.isNoteSaved ? 'Saved' : 'Save note'}
                  <Bookmark
                    className="w-4 h-4"
                    fill={config.saveNote.isNoteSaved ? 'currentColor' : 'none'}
                  />
                </button>
              )}
              {config.publish && (
                <ButtonWrapper
                  size="sm"
                  className="gap-1.5 px-3 h-9 text-sm whitespace-nowrap"
                  onClick={config.publish.onPublish}
                  disabled={config.publish.disabled}
                >
                  Publish
                </ButtonWrapper>
              )}
            </div>
          )}
        </div>

        {sessionId && (
          <p className="text-[8px] text-[#767676] flex justify-end w-full">{sessionId}</p>
        )}
      </div>
    </div>
  );
}
