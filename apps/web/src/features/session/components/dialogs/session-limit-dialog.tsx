'use client';

import { Check, CircleAlert, X } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, Button } from '@ui/src';

const BULLET_ITEMS = [
  {
    title: 'Unlimited sessions',
    description: 'Record and transcribe as many consultations as you need',
  },
  {
    title: 'Multiple note formats',
    description: 'Custom templates, community templates and more',
  },
  {
    title: 'Priority support',
    description: 'Direct access to our support team',
  },
];

interface SessionLimitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SessionLimitDialog = ({ open, onOpenChange }: SessionLimitDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="w-[360px] max-w-[360px] p-0 gap-0 rounded-xl overflow-hidden border-none"
      >
        <DialogTitle className="sr-only">Session Limit Reached</DialogTitle>

        {/* Top section - gradient background */}
        <div
          className="relative flex flex-col gap-8 p-4"
          style={{
            background: 'radial-gradient(circle at 0% 0%, #215FFF 0%, #4535B0 100%)',
          }}
        >
          {/* Alert badge */}
          <div className="flex items-center gap-1 w-fit rounded-lg border border-white/30 bg-white px-2 py-1 shadow-[0px_0px_4px_0px_rgba(255,255,255,0.25)]">
            <CircleAlert className="w-4 h-4 text-[#215FFF]" />
            <span className="text-xs text-[#215FFF]">20 of 20 free sessions used</span>
          </div>

          {/* Headline */}
          <div className="flex flex-col gap-2">
            <h2 className="text-2xl font-semibold leading-8 tracking-tight text-white">
              You&apos;ve hit your sessions limit!
            </h2>
            <p className="text-sm leading-5 text-[#E6E6E6]">
              Upgrade for unlimited sessions and everything else eka.scribe has to offer
            </p>
          </div>

          {/* Close button */}
          <button
            onClick={() => onOpenChange(false)}
            className="absolute top-4 right-4 cursor-pointer text-white/70 hover:text-white transition-opacity"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Bottom section - white background */}
        <div className="flex flex-col gap-[22px] bg-white p-4">
          {/* Bullet items */}
          <div className="flex flex-col gap-2">
            {BULLET_ITEMS.map((item) => (
              <div key={item.title} className="flex gap-[9px]">
                <div className="flex items-center h-6 shrink-0">
                  <Check className="w-4 h-4 text-[#008055]" />
                </div>
                <div className="flex flex-col">
                  <span className="text-base font-medium leading-6 text-[#191919]">
                    {item.title}
                  </span>
                  <span className="text-sm leading-5 text-[#808080]">{item.description}</span>
                </div>
              </div>
            ))}
          </div>

          {/* CTA buttons */}
          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              className="w-full rounded-xl cursor-pointer border-[#CCCCCC]"
              onClick={() => onOpenChange(false)}
            >
              <span className="text-[#215FFF]">Extend limit by 1 day</span>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SessionLimitDialog;
