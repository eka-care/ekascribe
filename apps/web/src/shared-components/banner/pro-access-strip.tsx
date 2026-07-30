'use client';

import React from 'react';
import { Button } from '@ui/src';
import { Crown, X } from 'lucide-react';
import { useStorage, useSystem } from '@/platform';

export const PRO_STRIP_DISMISSED_KEY = 'pro_access_strip_dismissed';

const ProAccessStrip = ({ onDismiss }: { onDismiss: () => void }) => {
  const storage = useStorage();
  const system = useSystem();

  const handleDismiss = () => {
    storage.local.set(PRO_STRIP_DISMISSED_KEY, 'true');
    onDismiss();
  };

  const handleUpgrade = () => {
    handleDismiss();
    system?.openExternal('https://scribe.eka.care/pricing?plan=yearly');
  };

  return (
    <div
      className="w-full px-4 py-2.5 z-50 shadow-md shrink-0"
      style={{ background: 'linear-gradient(90deg, #237d58, #34a574, #237d58)' }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Crown className="w-4 h-4 shrink-0 text-yellow-300" />
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-semibold text-white">
              Exclusive Pro Access — Free for 1 Year
            </span>
            <p className="text-xs text-white/80">
              Unlimited sessions, custom templates, and advanced features. Use{' '}
              <span className="font-semibold text-yellow-300">PROFREE1YR</span> — limited time only.
              <span className="text-white/60 ml-1">T&Cs apply</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            className="cursor-pointer text-xs font-semibold bg-white hover:bg-white/90 text-primary"
            onClick={handleUpgrade}
          >
            Upgrade Plan
          </Button>
          <button
            onClick={handleDismiss}
            className="cursor-pointer p-1 rounded-md transition-colors text-white/60 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProAccessStrip;
