'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Minus } from 'lucide-react';
import type { NodeViewProps } from '@tiptap/react';
import { Popover, PopoverContent, PopoverTrigger } from '@ui/src';

import { CustomTooltip, CustomTooltipContent, CustomTooltipTrigger } from '@/shared-components/custom-tooltip';
import type { TrendEntry } from '../table/types';

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

interface RowActionsCellProps {
  editor: NodeViewProps['editor'];
  editable: boolean;
  alwaysShowDelete: boolean;
  isRowDeleteHovered: boolean;
  trend: TrendEntry[];
  onDeleteHoverChange: (hovered: boolean) => void;
  onDelete: () => void;
}

export function RowActionsCell({
  editor,
  editable,
  alwaysShowDelete,
  isRowDeleteHovered,
  trend,
  onDeleteHoverChange,
  onDelete,
}: RowActionsCellProps) {
  const [trendOpen, setTrendOpen] = useState(false);

  useEffect(() => {
    if (!trendOpen) return;
    const dismiss = () => setTrendOpen(false);
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    return () => {
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
    };
  }, [trendOpen]);

  const registry = useMemo(() => getTrendPopoverRegistry(editor), [editor]);
  const closeTrend = useCallback(() => setTrendOpen(false), []);
  useEffect(() => {
    return () => {
      if (registry.closeActive === closeTrend) registry.closeActive = null;
    };
  }, [registry, closeTrend]);

  const handleTrendOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        if (registry.closeActive !== closeTrend) registry.closeActive?.();
        registry.closeActive = closeTrend;
      } else if (registry.closeActive === closeTrend) {
        registry.closeActive = null;
      }
      setTrendOpen(open);
    },
    [registry, closeTrend]
  );

  return (
    <div
      className={
        'sticky right-0 z-10 flex items-center justify-start gap-1 px-2 border-l border-[#E5E7EB] will-change-transform [.is-scrolled_&]:shadow-[-6px_0_8px_-6px_rgba(15,23,42,0.15)] ' +
        (isRowDeleteHovered ? 'bg-[#FFEBED]' : 'bg-white')
      }
    >
      {editable && (
        <CustomTooltip>
          <CustomTooltipTrigger asChild>
            <button
              type="button"
              className={
                'flex items-center justify-center w-3 h-3 rounded-full bg-white border border-[#767676] text-[#767676] hover:bg-[#FEF2F2] hover:border-[#DC2626] hover:text-[#DC2626] transition-colors cursor-pointer' +
                (alwaysShowDelete ? '' : 'opacity-0 group-hover:opacity-100')
              }
              onMouseEnter={() => onDeleteHoverChange(true)}
              onMouseLeave={() => onDeleteHoverChange(false)}
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
            >
              <Minus className="w-2 h-2" />
            </button>
          </CustomTooltipTrigger>
          <CustomTooltipContent>Delete row</CustomTooltipContent>
        </CustomTooltip>
      )}

      {trend.length > 0 && (
        <Popover open={trendOpen} onOpenChange={handleTrendOpenChange}>
          <CustomTooltip>
            <CustomTooltipTrigger asChild>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="group/trend flex items-center justify-center cursor-pointer"
                  onMouseDown={stop}
                  onClick={stop}
                >
                  <span className="flex items-center justify-center p-1 rounded-md transition-colors group-hover/trend:bg-[#EEF2FF]">
                    <TrendIcon className="w-4 h-4" />
                  </span>
                </button>
              </PopoverTrigger>
            </CustomTooltipTrigger>
            <CustomTooltipContent>Trend</CustomTooltipContent>
          </CustomTooltip>
          <PopoverContent align="end" className="w-56 p-0 border-0 shadow-lg overflow-hidden" onMouseDown={stop}>
            <div className="flex items-center gap-1.5 px-3 py-2 bg-[#EEF2FF] text-[#215FFF]">
              <TrendIcon className="w-5 h-5" />
              <span className="text-sm font-semibold">Trend</span>
            </div>
            <div className="flex flex-col gap-1 p-2 max-h-48 overflow-y-auto">
              {trend.map((entry, index) => (
                <div key={index} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-[#191919]">{[entry.value, entry.unit].filter(Boolean).join(' ')}</span>
                  {entry.date && (
                    <span className="text-xs text-[#9CA3AF] whitespace-nowrap">{entry.date}</span>
                  )}
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

type TrendPopoverRegistry = { closeActive: (() => void) | null };

function getTrendPopoverRegistry(editor: NodeViewProps['editor']): TrendPopoverRegistry {
  const storage = editor.storage as unknown as Record<string, unknown>;
  if (!storage.trendPopoverRegistry) {
    storage.trendPopoverRegistry = { closeActive: null } satisfies TrendPopoverRegistry;
  }
  return storage.trendPopoverRegistry as TrendPopoverRegistry;
}

function TrendIcon({ className }: { className?: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M10.0026 12.6667V16M12.6693 11.3333V16M15.3359 8.66667V16M16.6693 4L10.9053 9.764C10.8743 9.79504 10.8375 9.81967 10.797 9.83647C10.7565 9.85328 10.7131 9.86193 10.6693 9.86193C10.6254 9.86193 10.582 9.85328 10.5415 9.83647C10.501 9.81967 10.4642 9.79504 10.4333 9.764L8.2386 7.56933C8.17609 7.50684 8.09133 7.47174 8.00294 7.47174C7.91455 7.47174 7.82978 7.50684 7.76727 7.56933L3.33594 12M4.66927 14V16M7.33594 11.3333V16"
        stroke="#215FFF"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
