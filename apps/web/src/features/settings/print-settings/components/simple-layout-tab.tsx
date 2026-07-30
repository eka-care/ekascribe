'use client';

import { Info, Lightbulb } from 'lucide-react';
import LabeledRangeSlider from './labeled-range-slider';
import {
  SIMPLE_LAYOUT_RANGE_CM,
  SIMPLE_LAYOUT_PRESETS,
  SIMPLE_LAYOUT_INFO,
} from '@/features/settings/print-settings/config/print-settings-config';
import type { SimpleLayoutState } from '@/features/settings/print-settings/hooks/use-print-settings';

type SimpleLayoutTabProps = {
  layout: SimpleLayoutState;
  onLayoutChange: (updater: (prev: SimpleLayoutState) => SimpleLayoutState) => void;
};

const SimpleLayoutTab = ({ layout, onLayoutChange }: SimpleLayoutTabProps) => {
  return (
    <div className="flex flex-col gap-4">
      <div className="border border-primary/20 bg-primary/5 rounded-lg p-3 flex items-start gap-2">
        <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium text-primary">Pre-printed Letterheads</p>
          <p className="text-xs text-[#767676]">
            Reserve blank space at top and bottom for your existing letterhead.
          </p>
        </div>
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <div className="bg-primary text-primary-foreground px-4 py-2 text-sm font-medium">
          Margin Configuration
        </div>
        <div className="p-4 flex flex-col gap-5">
          <LabeledRangeSlider
            label="Header Space"
            sublabel="Top margin for letterhead"
            value={Number(layout.headerSpaceCm.toFixed(1))}
            min={SIMPLE_LAYOUT_RANGE_CM.min}
            max={SIMPLE_LAYOUT_RANGE_CM.max}
            step={SIMPLE_LAYOUT_RANGE_CM.step}
            onChange={(v) => onLayoutChange((prev) => ({ ...prev, headerSpaceCm: v }))}
          />
          <LabeledRangeSlider
            label="Footer Space"
            sublabel="Bottom margin for letterhead"
            value={Number(layout.footerSpaceCm.toFixed(1))}
            min={SIMPLE_LAYOUT_RANGE_CM.min}
            max={SIMPLE_LAYOUT_RANGE_CM.max}
            step={SIMPLE_LAYOUT_RANGE_CM.step}
            onChange={(v) => onLayoutChange((prev) => ({ ...prev, footerSpaceCm: v }))}
          />
        </div>
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <div className="bg-muted px-4 py-2 text-sm font-medium">Quick Presets</div>
        <div className="p-3 grid grid-cols-3 gap-2">
          {SIMPLE_LAYOUT_PRESETS.map((preset) => {
            const isActive =
              Math.abs(layout.headerSpaceCm - preset.header) < 0.05 &&
              Math.abs(layout.footerSpaceCm - preset.footer) < 0.05;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() =>
                  onLayoutChange(() => ({
                    headerSpaceCm: preset.header,
                    footerSpaceCm: preset.footer,
                  }))
                }
                className={`border rounded-md px-3 py-2 text-center cursor-pointer transition-colors ${
                  isActive
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:bg-muted/60'
                }`}
              >
                <p className="text-sm font-medium">{preset.label}</p>
                <p className="text-xs text-[#767676]">
                  {preset.header}cm / {preset.footer}cm
                </p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="border border-border rounded-lg p-3 bg-muted/40 flex items-start gap-2">
        <Lightbulb className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium">When to use this?</p>
          <p className="text-xs text-[#767676]">{SIMPLE_LAYOUT_INFO}</p>
        </div>
      </div>
    </div>
  );
};

export default SimpleLayoutTab;
